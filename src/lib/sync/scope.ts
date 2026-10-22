import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";
import type { SizingPathCoverageRow } from "@/lib/db/sizing-path-coverage";
import { listSizingProductRecordsByIds } from "@/lib/db/sizing-product-records";
import type { SizingRunRow } from "@/lib/db/sizing-runs";
import { listRunSyncProducts, type SyncNewProductRow } from "@/lib/db/sync-new-products";
import type { PreviewScope } from "@/lib/catalog/acs/stage-five-preview";

/** The products a run took that the store still sells: everything Stage 4 and 5 of a sync cover. */
export async function runProducts(run: SizingRunRow): Promise<SyncNewProductRow[]> {
  return (await listRunSyncProducts(run.id)).filter((product) => product.status !== "removed");
}

export function previewScopeFor(run: SizingRunRow, products: readonly SyncNewProductRow[]): PreviewScope {
  return { key: `sync:${run.id}`, externalIds: products.map((product) => product.externalId) };
}

/**
 * Coverage and path coverage cut down to what one sync's products sit on, and counted over those
 * products alone.
 *
 * Stage 4 decides what to list from these rows, so this is what scopes a sync's chart review: a
 * (brand, sizing category) pair Setup left open but no new product touches is not this sync's
 * question, and a pair a new product does touch shows only the leaves those products sit on.
 */
export async function scopedCoverageForRun(
  connectionId: string,
  products: readonly SyncNewProductRow[],
  coverage: readonly SizingCoverageRow[],
  pathCoverage: readonly SizingPathCoverageRow[],
): Promise<{ coverage: SizingCoverageRow[]; pathCoverage: SizingPathCoverageRow[] }> {
  const records = await listSizingProductRecordsByIds(
    connectionId,
    products.map((product) => product.externalId),
  );
  const pairCounts = new Map<string, number>();
  const leafCounts = new Map<string, number>();
  for (const record of records) {
    const pair = `${record.brandKey}\u0000${record.sizingCategory}`;
    pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
    if (record.primaryPersonaLeafKey) {
      const leaf = `${record.brandKey}\u0000${record.primaryPersonaLeafKey}\u0000${record.sizingCategory}`;
      leafCounts.set(leaf, (leafCounts.get(leaf) ?? 0) + 1);
    }
  }

  const ids = new Set(records.map((record) => record.externalId));
  const scopedCoverage = coverage.flatMap((row) => {
    const count = pairCounts.get(`${row.brandKey}\u0000${row.sizingCategory}`);
    if (!count) return [];
    const ownSamples = row.sampleSkus.filter((sample) => ids.has(sample.externalId));
    return [{ ...row, skuCount: count, sampleSkus: ownSamples.length > 0 ? ownSamples : row.sampleSkus }];
  });
  const scopedPaths = pathCoverage.flatMap((row) => {
    const count = leafCounts.get(`${row.brandKey}\u0000${row.categoryId}\u0000${row.sizingCategory}`);
    return count ? [{ ...row, skuCount: count }] : [];
  });
  return { coverage: scopedCoverage, pathCoverage: scopedPaths };
}
