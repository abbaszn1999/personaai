import { createHash } from "node:crypto";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import {
  getSizingProductSnapshotMarker,
  listSizingProductRecordsPage,
} from "@/lib/db/sizing-product-records";
import { getLatestSizingRun } from "@/lib/db/sizing-runs";
import { resolveCategoryPaths, resolveGarmentCategory } from "@/lib/catalog/index-product";
import { resolveRawProductSizing } from "@/lib/catalog/sizing-for-product";
import { getRawProducts, oldestFetchedAt } from "@/lib/catalog/raw-product-cache";
import {
  loadSizingResolutionContext,
  type ProductChartStatus,
  type SizingResolutionContext,
} from "@/lib/sizing/product-chart";
import { createSwrCache } from "@/lib/cache/swr-cache";
import { rawCatalogProductToAcsProducts } from "./map-product";
import {
  filterStageFiveRecords,
  toStageFiveRecord,
  withBrandType,
  type AcsStageFiveListing,
  type StageFiveFilters,
  type StageFiveRecord,
} from "./stage-five-listing";
import type { BrandType } from "@/lib/db/sizing-coverage";

export interface AcsStageFivePreview extends AcsStageFiveListing {
  /** Number of PRIMARY records in this final ACS-record page. */
  pageProductCount: number;
}

/** Products that will publish without a size chart, grouped by what they are missing and why. */
export interface UnresolvedSizingGroup {
  brandKey: string;
  brandName: string | null;
  leafKey: string | null;
  status: Exclude<ProductChartStatus, "matched">;
  count: number;
  sampleSkus: string[];
}

export interface GeneratedSizingSummary {
  /** Every product the sizing snapshot holds, including ones the merchant's mapping leaves out. */
  total: number;
  variantCount: number;
  matched: number;
  /** Snapshot products with no mapped Persona path. They never reach ACS, so they are neither
   *  matched nor unresolved. */
  excluded: number;
  /** Snapshot products the store no longer returns (deleted or unpublished since the scan). */
  unavailable: number;
  /** Outcome of every product that does publish, matched included. */
  byStatus: Partial<Record<ProductChartStatus, number>>;
  /** Largest groups first, capped; `unresolved` below is the exact total behind them. */
  unresolvedGroups: UnresolvedSizingGroup[];
  unresolved: number;
  chartKeys: string[];
  canonicalBrandKeys: string[];
  brandMappingCurrent: boolean;
}

interface GeneratedCatalogSnapshot {
  records: StageFiveRecord[];
  summary: GeneratedSizingSummary;
  /** When the oldest store product behind it was read. */
  readAt: number;
}

export interface SnapshotFreshness {
  /** When the snapshot being shown was built. */
  builtAt: number;
  /** True while a newer one is being built in the background. */
  refreshing: boolean;
}

const MAX_UNRESOLVED_GROUPS = 100;
const MAX_SAMPLE_SKUS = 3;
const SNAPSHOT_PAGE_SIZE = 1_000;

/**
 * How old the store products behind the preview may be. Long enough that paging, filtering and a
 * round of chart edits all reuse one store read; short enough that price and stock drift is bounded.
 * Whatever the merchant changes in this app is caught immediately by the fingerprint, not by age.
 */
export const PREVIEW_MAX_AGE_MS = 10 * 60_000;

/**
 * How old the store products may be when the preview is built for a reason other than time passing
 * (a changed chart or mapping, or the first build after a restart). Re-reading the whole store for
 * that would turn a one-second re-resolution into a minute-long wait; the age-based refresh still
 * brings the products up to date behind it.
 */
const INPUT_CHANGE_RAW_MAX_AGE_MS = 6 * 60 * 60_000;

const snapshots = createSwrCache<GeneratedCatalogSnapshot>({
  name: "stage-five-preview",
  maxEntries: 6,
});

const contextMemo = (() => {
  const holder = globalThis as typeof globalThis & {
    __personaPreviewContext?: Map<string, { at: number; value: Promise<PreviewInputs> }>;
  };
  holder.__personaPreviewContext ??= new Map();
  return holder.__personaPreviewContext;
})();

/** Re-reading charts and coverage for every page click would cost more than the page itself. */
const CONTEXT_MEMO_MS = 3_000;

interface PreviewInputs {
  context: SizingResolutionContext;
  fingerprint: string;
}

/**
 * Everything the generated preview is a function of, hashed. A changed category mapping, field
 * mapping, Stage 2 correction, size setting, brand type, canonical brand mapping, chart, or a new
 * scan all change it, so none of them can be shown against a preview built before them.
 */
function fingerprintFor(
  connection: StoreConnectionRow,
  runId: string | null,
  snapshotMarker: string | null,
  context: SizingResolutionContext,
): string {
  const charts = (rows: SizingResolutionContext["sharedCharts"]) =>
    rows.map((chart) => [chart.id, chart.version, chart.updatedAt]).sort();
  const payload = JSON.stringify([
    runId,
    // A re-scan can keep its run; the rewritten product snapshot is what says it happened.
    snapshotMarker ?? `unknown:${Date.now()}`,
    connection.platform,
    connection.storeCurrency,
    connection.personaTaxonomyScope,
    connection.personaCategoryMap,
    connection.categories.map((category) => [category.id, category.parentId ?? null]),
    connection.acsFieldMapping,
    connection.skuParentOverrides,
    connection.storeSizeSettings,
    connection.sizingBrandMapping,
    [...context.brandTypes].sort(),
    context.brandMappingCurrent,
    charts(context.sharedCharts),
    charts(context.privateCharts),
  ]);
  return createHash("sha1").update(payload).digest("hex");
}

async function previewInputs(connection: StoreConnectionRow): Promise<PreviewInputs> {
  const memo = contextMemo.get(connection.id);
  if (memo && Date.now() - memo.at <= CONTEXT_MEMO_MS) return memo.value;
  const value = (async () => {
    const [run, snapshotMarker, context] = await Promise.all([
      getLatestSizingRun(connection.id),
      getSizingProductSnapshotMarker(connection.id),
      loadSizingResolutionContext(connection),
    ]);
    return { context, fingerprint: fingerprintFor(connection, run?.id ?? null, snapshotMarker, context) };
  })();
  contextMemo.set(connection.id, { at: Date.now(), value });
  try {
    return await value;
  } catch (error) {
    contextMemo.delete(connection.id);
    throw error;
  }
}

async function buildCatalogSnapshot(
  connection: StoreConnectionRow,
  context: SizingResolutionContext,
  rawMaxAgeMs: number,
): Promise<GeneratedCatalogSnapshot> {
  const externalIds: string[] = [];
  let total = 0;
  for (let offset = 0; ; offset += SNAPSHOT_PAGE_SIZE) {
    const page = await listSizingProductRecordsPage(connection.id, { offset, limit: SNAPSHOT_PAGE_SIZE });
    total = page.total;
    externalIds.push(...page.records.map((record) => record.externalId));
    if (page.records.length < SNAPSHOT_PAGE_SIZE || externalIds.length >= total) break;
  }

  const raws = await getRawProducts(connection, externalIds, { maxAgeMs: rawMaxAgeMs });
  const readAt = oldestFetchedAt(connection.id, externalIds) ?? Date.now();

  const records: StageFiveRecord[] = [];
  const chartKeys = new Set<string>();
  const canonicalBrandKeys = new Set<string>();
  const byStatus: Partial<Record<ProductChartStatus, number>> = {};
  const groups = new Map<string, UnresolvedSizingGroup>();
  let matched = 0;
  let excluded = 0;
  let unavailable = 0;
  let unresolved = 0;
  let variantCount = 0;

  // Snapshot order, so page boundaries do not reshuffle when the store answers ids in its own order.
  for (const externalId of externalIds) {
    const raw = raws.get(externalId);
    if (!raw) {
      unavailable += 1;
      continue;
    }
    const categoryPaths = resolveCategoryPaths(raw, connection);
    if (categoryPaths.length === 0) {
      excluded += 1;
      continue;
    }
    const { sizing, resolution } = resolveRawProductSizing(raw, connection, context);
    byStatus[resolution.status] = (byStatus[resolution.status] ?? 0) + 1;
    if (resolution.status !== "matched") {
      unresolved += 1;
      const groupKey = `${resolution.canonicalBrandKey}|${resolution.leafKey ?? ""}|${resolution.status}`;
      let group = groups.get(groupKey);
      if (!group) {
        group = {
          brandKey: resolution.canonicalBrandKey,
          brandName: raw.brand ?? null,
          leafKey: resolution.leafKey,
          status: resolution.status,
          count: 0,
          sampleSkus: [],
        };
        groups.set(groupKey, group);
      }
      group.count += 1;
      const sample = raw.sku ?? raw.title;
      if (sample && group.sampleSkus.length < MAX_SAMPLE_SKUS) group.sampleSkus.push(sample);
    }
    const { garmentCategory, garmentSubcategory } = resolveGarmentCategory(raw);
    const generated = rawCatalogProductToAcsProducts({
      raw,
      connectionId: connection.id,
      categoryPaths,
      garmentCategory,
      garmentSubcategory,
      fieldMapping: connection.acsFieldMapping,
      sizing,
    });
    for (const product of generated) records.push(toStageFiveRecord(product));
    variantCount += generated.filter((product) => product.type === "VARIANT").length;
    if (sizing) {
      matched += 1;
      chartKeys.add(sizing.chartKey);
      const canonicalBrandKey = sizing.chartKey.split("|", 1)[0];
      if (canonicalBrandKey) canonicalBrandKeys.add(canonicalBrandKey);
    }
  }

  return {
    records,
    readAt,
    summary: {
      total,
      variantCount,
      matched,
      excluded,
      unavailable,
      byStatus,
      unresolved,
      unresolvedGroups: [...groups.values()]
        .sort((a, b) => b.count - a.count || a.brandKey.localeCompare(b.brandKey))
        .slice(0, MAX_UNRESOLVED_GROUPS),
      chartKeys: [...chartKeys],
      canonicalBrandKeys: [...canonicalBrandKeys],
      brandMappingCurrent: context.brandMappingCurrent,
    },
  };
}

async function generatedSnapshot(
  connection: StoreConnectionRow,
  mode: "swr" | "current",
): Promise<{ snapshot: GeneratedCatalogSnapshot } & SnapshotFreshness> {
  const { context, fingerprint } = await previewInputs(connection);
  // Only an age-based rebuild of an unchanged preview re-reads the store. A first build (including
  // the first after a restart, from persisted reads) or one for changed inputs reuses what was read.
  const previous = snapshots.peek(connection.id);
  const reuseReads = previous === undefined || previous.fingerprint !== fingerprint;
  const result = await snapshots.get(connection.id, {
    fingerprint,
    maxAgeMs: PREVIEW_MAX_AGE_MS,
    mode,
    build: () =>
      buildCatalogSnapshot(
        connection,
        context,
        reuseReads ? INPUT_CHANGE_RAW_MAX_AGE_MS : PREVIEW_MAX_AGE_MS,
      ),
  });

  // Built on top of older store reads: answer now, and bring the products up to date behind it.
  let refreshing = result.refreshing;
  if (!refreshing && Date.now() - result.value.readAt > PREVIEW_MAX_AGE_MS) {
    snapshots.invalidate(connection.id);
    void snapshots
      .get(connection.id, {
        fingerprint,
        maxAgeMs: PREVIEW_MAX_AGE_MS,
        build: () => buildCatalogSnapshot(connection, context, PREVIEW_MAX_AGE_MS),
      })
      .catch(() => undefined);
    refreshing = true;
  }
  return { snapshot: result.value, builtAt: result.builtAt, refreshing };
}

/**
 * The sizing outcome of every product as it would publish now.
 *
 * `swr` (screens) answers from the last build and refreshes behind it; `current` (the publish gate)
 * waits until the answer reflects every input as it stands, so a confirmation is never given against
 * an outdated count.
 */
export async function summarizeGeneratedSizing(
  connection: StoreConnectionRow,
  options: { mode?: "swr" | "current" } = {},
): Promise<GeneratedSizingSummary & SnapshotFreshness> {
  const { snapshot, builtAt, refreshing } = await generatedSnapshot(connection, options.mode ?? "swr");
  return { ...snapshot.summary, builtAt, refreshing };
}

export async function listGeneratedAcsStageFiveProducts(
  connection: StoreConnectionRow,
  options: StageFiveFilters & {
    offset: number;
    limit: number;
    brandKeys?: string[] | null;
    brandTypes?: ReadonlyMap<string, BrandType>;
  },
): Promise<AcsStageFivePreview & SnapshotFreshness> {
  const { snapshot, builtAt, refreshing } = await generatedSnapshot(connection, "swr");
  const filtered = filterStageFiveRecords(snapshot.records, options);
  const page = filtered.slice(options.offset, options.offset + options.limit);
  const counts = {
    primary: page.filter((record) => record.row.type === "PRIMARY").length,
    variant: page.filter((record) => record.row.type === "VARIANT").length,
    inStock: page.filter((record) => record.row.availability === "IN_STOCK").length,
    outOfStock: page.filter((record) => record.row.availability === "OUT_OF_STOCK").length,
    otherAvailability: page.filter(
      (record) => record.row.availability !== "IN_STOCK" && record.row.availability !== "OUT_OF_STOCK",
    ).length,
  };

  return {
    rows: page.map((record) => withBrandType(record, options.brandTypes)),
    total: filtered.length,
    pageProductCount: counts.primary,
    counts,
    builtAt,
    refreshing,
  };
}

/** Starts a build if none is current, without waiting for it — for screens the merchant is likely
 *  to open next. */
export function warmGeneratedSizing(connection: StoreConnectionRow): void {
  void generatedSnapshot(connection, "swr").catch((error) =>
    console.error("[stage-five-preview warm]", connection.id, error),
  );
}

/** Kept for callers that know an input changed; the fingerprint would catch it on the next read. */
export function clearGeneratedStageFiveCache(connectionId?: string): void {
  if (connectionId) {
    snapshots.invalidate(connectionId);
    contextMemo.delete(connectionId);
  } else {
    contextMemo.clear();
  }
}
