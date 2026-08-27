import { enqueueCatalogSync } from "@/lib/catalog/enqueue-sync";
import { listConnectedStores, updateCatalogSyncState } from "@/lib/db/store-connections";
import { isInternalRequest } from "@/lib/utils/internal-auth";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

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
 */
export async function POST(request: Request) {
  if (!isInternalRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const connections = await listConnectedStores();
    const reconciled: Array<{ connectionId: string; enqueued: number }> = [];

    for (const connection of connections) {
      // Skip anything mid-backfill: its walk is already enqueueing the selection, and a reconcile
      // on top would duplicate that work rather than add to it. Also skips stores with no
      // selection yet, which are `idle` and have nothing to reconcile against.
      if (connection.catalogSyncStatus !== "ready") continue;

      try {
        const result = await enqueueCatalogSync(connection);

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

        reconciled.push({ connectionId: connection.id, enqueued: result.enqueued });
      } catch (err) {
        console.error("[internal/catalog/reconcile]", connection.id, err);
      }
    }

    return Response.json({ reconciled });
  } catch (err) {
    console.error("[internal/catalog/reconcile]", err);
    return Response.json({ error: "Reconcile failed" }, { status: 500 });
  }
}
