import { syncProductsToAcs } from "@/lib/catalog/acs/sync";
import type { MapProductInput } from "@/lib/catalog/acs/map-product";
import { clearAcsStageFiveCache } from "@/lib/catalog/acs/stage-five-listing";
import { resolveCategoryPaths, resolveGarmentCategory } from "@/lib/catalog/index-product";
import { createCatalogPager } from "@/lib/catalog/pager";
import { scheduleRebuildPersonaPathConfig } from "@/lib/catalog/path-config/rebuild";
import { resolveRawProductSizing } from "@/lib/catalog/sizing-for-product";
import { computeSourceHash, sourceConfigKey } from "@/lib/catalog/source-hash";
import type { RawCatalogProduct } from "@/lib/catalog/sync-types";
import { saveSourceHashes } from "@/lib/db/catalog-source-hashes";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { getAcsPublishStampId, updateSizingRun, type SizingRunRow } from "@/lib/db/sizing-runs";
import {
  listRunSyncProducts,
  markRunSyncProductsPublished,
  markRunSyncProductsRemoved,
  type SyncChartStatus,
} from "@/lib/db/sync-new-products";
import { loadSizingResolutionContext, type SizingResolutionContext } from "@/lib/sizing/product-chart";

/** Products per ACS import. Small enough that one failed import costs little to retry. */
const PUBLISH_CHUNK = 100;

export interface DeltaPublishResult {
  written: number;
  excluded: number;
  removed: number;
}

export interface PreparedSyncProduct {
  raw: RawCatalogProduct;
  input: MapProductInput | null;
  chartStatus: SyncChartStatus;
}

/**
 * One new product as the queue worker would write it, with what its sizing resolved to.
 *
 * Built from the same functions as `processConnectionBatch`, so a synced product is
 * indistinguishable in ACS from one Setup's publish wrote.
 */
export function prepareSyncProduct(
  raw: RawCatalogProduct,
  connection: StoreConnectionRow,
  context: SizingResolutionContext,
  publishId: string | null,
): PreparedSyncProduct {
  const categoryPaths = resolveCategoryPaths(raw, connection);
  if (categoryPaths.length === 0) return { raw, input: null, chartStatus: "excluded" };
  const sized = resolveRawProductSizing(raw, connection, context);
  const chartStatus: SyncChartStatus = sized.input.sizingCategory === ""
    ? "unsized"
    : sized.resolution.status === "matched"
      ? "matched"
      : "unresolved";
  const { garmentCategory, garmentSubcategory } = resolveGarmentCategory(raw);
  return {
    raw,
    chartStatus,
    input: {
      raw,
      connectionId: connection.id,
      categoryPaths,
      garmentCategory,
      garmentSubcategory,
      fieldMapping: connection.acsFieldMapping,
      sizing: sized.sizing,
      publishId,
    },
  };
}

/**
 * Writes a sync's products to ACS, and only them.
 *
 * Stamped with the catalog's current publish id rather than the sync's own run id: the products
 * join the catalog Setup published, so the next Setup publish retires them with it, and nothing
 * here retires anything. Re-runnable — only products still `syncing` are written, so a worker that
 * died part-way resumes with what is left.
 */
export async function runDeltaPublish(connection: StoreConnectionRow, run: SizingRunRow): Promise<DeltaPublishResult> {
  const owned = (await listRunSyncProducts(run.id)).filter((product) => product.status === "syncing");
  const result: DeltaPublishResult = { written: 0, excluded: 0, removed: 0 };
  if (owned.length === 0) return result;

  const pager = await createCatalogPager(connection);
  if (!pager) throw new Error("No categories are selected for indexing, so there is nothing to publish.");
  const [raws, context, publishId] = await Promise.all([
    pager.fetchByIds(owned.map((product) => product.externalId)),
    loadSizingResolutionContext(connection),
    getAcsPublishStampId(connection.id),
  ]);

  const byId = new Map(raws.map((raw) => [raw.externalId, raw]));
  const gone = owned.filter((product) => !byId.has(product.externalId)).map((product) => product.externalId);
  if (gone.length > 0) await markRunSyncProductsRemoved(run.id, gone);
  result.removed = gone.length;

  const prepared = owned.flatMap((product) => {
    const raw = byId.get(product.externalId);
    return raw ? [prepareSyncProduct(raw, connection, context, publishId)] : [];
  });
  const excluded = new Map<string, SyncChartStatus>();
  for (const entry of prepared) if (!entry.input) excluded.set(entry.raw.externalId, "excluded");
  if (excluded.size > 0) await markRunSyncProductsPublished(run.id, excluded);
  result.excluded = excluded.size;

  const importable = prepared.filter((entry): entry is PreparedSyncProduct & { input: MapProductInput } => entry.input !== null);
  await updateSizingRun(run.id, { phaseDone: 0, phaseTotal: importable.length });
  const configKey = sourceConfigKey(connection, publishId);
  let failed = 0;
  for (let index = 0; index < importable.length; index += PUBLISH_CHUNK) {
    const chunk = importable.slice(index, index + PUBLISH_CHUNK);
    const written = await syncProductsToAcs(chunk.map((entry) => entry.input));
    if (!written) {
      failed += chunk.length;
      continue;
    }
    // Saved after the confirmed write, as the queue worker does, so the hourly reconcile finds
    // these products unchanged instead of writing them a second time.
    await saveSourceHashes(
      connection.id,
      chunk.map((entry) => ({
        externalId: entry.raw.externalId,
        hash: computeSourceHash(entry.raw, entry.raw.sourceCategoryIds, configKey),
      })),
    );
    await markRunSyncProductsPublished(run.id, new Map(chunk.map((entry) => [entry.raw.externalId, entry.chartStatus])));
    result.written += chunk.length;
    await updateSizingRun(run.id, { phaseDone: result.written });
  }

  if (result.written > 0) {
    clearAcsStageFiveCache(connection.id);
    scheduleRebuildPersonaPathConfig(connection.id);
  }
  if (failed > 0) {
    throw new Error(
      `${failed.toLocaleString()} product${failed === 1 ? "" : "s"} could not be written to the catalog. Retry the sync to publish ${failed === 1 ? "it" : "them"}.`,
    );
  }
  return result;
}
