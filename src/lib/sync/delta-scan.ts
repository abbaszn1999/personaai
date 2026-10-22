import { createCatalogPager } from "@/lib/catalog/pager";
import { hasProductImage } from "@/lib/catalog/acs/map-product";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { listSizingCoverage, mergeSizingCoverage } from "@/lib/db/sizing-coverage";
import { addSizingNullRecords } from "@/lib/db/sizing-null-records";
import { mergeSizingPathCoverage } from "@/lib/db/sizing-path-coverage";
import { listSizingProductRecordIds, upsertSizingProductRecords } from "@/lib/db/sizing-product-records";
import { updateSizingRun, type SizingRunRow } from "@/lib/db/sizing-runs";
import {
  listRunSyncProducts,
  markRunSyncProductsRemoved,
  setRunBrandWasNew,
} from "@/lib/db/sync-new-products";
import { UNKNOWN_BRAND_KEY, normalizeBrandKey } from "@/lib/sizing/keys";
import { aggregateScanRows, personaConfigFor, toScanRow, type ScanRow } from "@/lib/sizing/scan";

export interface DeltaScanResult {
  scanned: number;
  removed: number;
  newBrands: number;
}

/**
 * Sync's version of the catalog scan: reads only the products this run took, and adds them to the
 * coverage, path coverage, unbranded list and product snapshot Setup wrote.
 *
 * Re-runnable. A product already in the snapshot was folded in by an earlier attempt of this run (a
 * worker that died after writing), so it is not counted again; the snapshot is written last for
 * exactly that reason.
 */
export async function runDeltaScan(connection: StoreConnectionRow, run: SizingRunRow): Promise<DeltaScanResult> {
  const products = await listRunSyncProducts(run.id);
  const owned = products.filter((product) => product.status === "syncing");
  await updateSizingRun(run.id, { phase: "walking", phaseDone: 0, phaseTotal: owned.length });

  const [recorded, coverage] = await Promise.all([
    listSizingProductRecordIds(connection.id),
    listSizingCoverage(connection.id, { fresh: true }),
  ]);
  if (!recorded) throw new Error("Could not read the saved product snapshot before syncing.");
  const knownBrands = new Set(
    coverage.filter((row) => row.brandType !== "unclassified").map((row) => row.brandKey),
  );

  const pager = await createCatalogPager(connection);
  if (!pager) throw new Error("No categories are selected for indexing, so there is nothing to sync.");
  const fresh = owned.filter((product) => !recorded.has(product.externalId));
  const raws = fresh.length > 0 ? await pager.fetchByIds(fresh.map((product) => product.externalId)) : [];
  const byId = new Map(raws.map((raw) => [raw.externalId, raw]));

  const personaConfig = personaConfigFor(connection);
  const scanned: ScanRow[] = [];
  const removed: string[] = [];
  for (const product of fresh) {
    const raw = byId.get(product.externalId);
    // Gone from the store, or lost its image, since it was detected: nothing to publish.
    if (!raw || !hasProductImage(raw)) {
      removed.push(product.externalId);
      continue;
    }
    scanned.push(toScanRow(raw, raw.sourceCategoryIds, connection, personaConfig));
  }
  if (removed.length > 0) await markRunSyncProductsRemoved(run.id, removed);

  await updateSizingRun(run.id, {
    productsScanned: owned.length - removed.length,
    phase: "aggregating",
    phaseDone: null,
    phaseTotal: null,
  });

  // Frozen before coverage changes: after the merge a new brand sits in coverage like any other.
  const brandWasNew = new Map<string, boolean>();
  const scannedBrands = new Map(scanned.map((row) => [row.externalId, normalizeBrandKey(row.brandField)]));
  for (const product of owned) {
    if (removed.includes(product.externalId)) continue;
    const brandKey = scannedBrands.get(product.externalId) ?? product.brandKey;
    brandWasNew.set(product.externalId, brandKey !== UNKNOWN_BRAND_KEY && !knownBrands.has(brandKey));
  }
  // A re-run sees the brand already merged, so it keeps the answer the first attempt recorded.
  for (const product of owned) {
    if (product.brandWasNew !== null) brandWasNew.set(product.externalId, product.brandWasNew);
  }
  await setRunBrandWasNew(run.id, brandWasNew);

  const { aggregator, pathRows, records } = aggregateScanRows(connection, scanned);
  if (!(await mergeSizingCoverage(connection.id, aggregator.rows()))) {
    throw new Error("Could not add the new products to the store's coverage.");
  }
  if (!(await mergeSizingPathCoverage(connection.id, pathRows))) {
    throw new Error("Could not add the new products' category paths.");
  }
  if (!(await addSizingNullRecords(connection.id, aggregator.nullRecords()))) {
    throw new Error("Could not add the new unbranded products.");
  }
  if (!(await upsertSizingProductRecords(connection.id, records))) {
    throw new Error("Could not save the new products to the sizing snapshot.");
  }

  const newBrands = new Set(
    [...brandWasNew].filter(([, isNew]) => isNew).map(([externalId]) => scannedBrands.get(externalId) ?? ""),
  );
  newBrands.delete(UNKNOWN_BRAND_KEY);
  return { scanned: scanned.length, removed: removed.length, newBrands: newBrands.size };
}
