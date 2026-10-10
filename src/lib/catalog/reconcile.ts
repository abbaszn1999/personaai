import { enqueueCatalogSync } from "./enqueue-sync";
import { listConnectedStores, updateCatalogSyncState } from "@/lib/db/store-connections";
import { rebuildStalePathConfigs } from "./path-config/rebuild";
import { findBillingGaps } from "@/lib/db/session-usage";

export const RECONCILE_JOB = "catalog-reconcile";
export const RECONCILE_EVERY_SECONDS = 60 * 60;

export interface ReconcilePassResult {
  reconciled: Array<{ connectionId: string; enqueued: number; unchanged: number }>;
  pathConfigs: Awaited<ReturnType<typeof rebuildStalePathConfigs>>;
  billingGaps: number;
}

/**
 * The safety net under webhooks.
 *
 * Webhooks are the fast path but not a guarantee: a delivery can fail while the merchant's
 * host is down, a subscription can be deleted from the Shopify admin, and bulk edits made
 * through an import tool often don't fire per-product events at all. This pass re-walks each
 * ready store's full selection so anything the webhooks missed is picked up on the next run
 * rather than staying wrong indefinitely.
 *
 * There is deliberately no `updatedAfter` cursor anymore. The pgvector cursor
 * (`getLatestSyncedAt`) read a `synced_at` column off `catalog_products`, which no longer
 * exists — and there is no equivalently cheap "most recently written" read against ACS. A full
 * re-walk costs more store-API pagination per run than an incremental one did, but each
 * product's ACS write is now a plain import with no per-product model call behind it, so the
 * write side of a full reconcile is far cheaper than it was when this cursor was added.
 *
 * Shared by the `pg_cron` route and the in-process worker, which runs it hourly.
 */
export async function runCatalogReconcilePass(): Promise<ReconcilePassResult> {
  const connections = await listConnectedStores();
  const reconciled: ReconcilePassResult["reconciled"] = [];

  for (const connection of connections) {
    // Skip anything mid-backfill: its walk is already enqueueing the selection, and a reconcile
    // on top would duplicate that work rather than add to it. Also skips stores with no
    // selection yet, which are `idle` and have nothing to reconcile against.
    if (connection.catalogSyncStatus !== "ready") continue;

    try {
      // Only what changed since it was last written: the walk still reads the whole selection
      // from the store, but ACS and the queue are only touched for products that differ.
      const result = await enqueueCatalogSync(connection, { skipUnchanged: true });

      // Anything enqueued means the catalog is briefly out of date again, so the flag goes
      // back to indexing — retrieval's fallback and the progress UI both read it. The total is
      // incremented rather than reset: `process-queue.ts`'s progress is a running delta against
      // it (there is no local table left to recount an absolute total from), so a reconcile
      // pass that doesn't grow the total would make its own progress look complete instantly.
      if (result.enqueued > 0) {
        await updateCatalogSyncState(connection.id, {
          status: "indexing",
          total: connection.catalogSyncTotal + result.enqueued,
        });
      }

      reconciled.push({
        connectionId: connection.id,
        enqueued: result.enqueued,
        unchanged: result.unchanged ?? 0,
      });
    } catch (err) {
      console.error("[catalog reconcile]", connection.id, err);
    }
  }

  // Webhook edits only flag the path config stale; this is where those rows are rebuilt, so a
  // merchant's single-product edits reach the agents' prompt without waiting for a full sync.
  const pathConfigs = await rebuildStalePathConfigs();

  // Every turn's cost must be covered by the units burned for it; a gap above one unit means a
  // charge went missing (or was doubled) somewhere and is worth a person looking at it.
  const billingGaps = await findBillingGaps();
  for (const gap of billingGaps) {
    console.error(
      `[billing reconcile] owner ${gap.ownerId}: turns cost ${gap.costNanos} nanos, units burned ${gap.unitsNanos} nanos, gap ${gap.gapNanos}`
    );
  }

  return { reconciled, pathConfigs, billingGaps: billingGaps.length };
}
