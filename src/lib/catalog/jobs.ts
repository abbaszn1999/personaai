import { startCatalogBackfill } from "./enqueue-sync";
import { listConnectionsBySyncStatus } from "@/lib/db/store-connections";

export interface EnqueuePassResult {
  connectionId: string;
  enqueued: number;
}

/**
 * Starts the catalog walk for every store waiting on one.
 *
 * Shared by the `pg_cron` route and the in-process worker so both drivers make identical
 * decisions — in particular which categories a `pending` store still owes, which is subtle
 * enough that two copies would drift.
 */
export async function runCatalogEnqueuePass(): Promise<EnqueuePassResult[]> {
  const pending = await listConnectionsBySyncStatus("pending");
  const started: EnqueuePassResult[] = [];

  // Sequential rather than parallel: each walk hammers one merchant's store API, and running
  // several at once turns a background job into a plausible source of rate limits on stores
  // that are also serving live shoppers.
  for (const connection of pending) {
    try {
      // A non-empty pending list means the merchant added categories to a catalog that is
      // already indexed, so only those need walking. Empty means the first index of a fresh
      // selection, where the whole selection is the work.
      const onlyCategoryIds = connection.catalogPendingCategoryIds.length
        ? connection.catalogPendingCategoryIds
        : undefined;

      const result = await startCatalogBackfill(connection, { onlyCategoryIds });
      started.push({ connectionId: connection.id, enqueued: result.enqueued });
    } catch (err) {
      console.error("[catalog jobs] enqueue failed for", connection.id, err);
    }
  }

  return started;
}
