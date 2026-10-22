import { getActiveSizingRun, getLatestSizingRun, updateSizingRun } from "@/lib/db/sizing-runs";
import { releaseRunSyncProducts } from "@/lib/db/sync-new-products";
import { SYNC_CANCELLED_MESSAGE } from "@/lib/sync/constants";
import { syncConnection } from "@/lib/sync/route-context";

/**
 * Stops a sync before it publishes and puts its products back in the queue.
 *
 * Only while it waits on the merchant, or after it failed: a scan or publish in the worker's hands
 * would keep writing for a run that no longer owns its products.
 */
export async function POST() {
  try {
    const { connection, response } = await syncConnection({ writing: true });
    if (response) return response;
    const active = await getActiveSizingRun(connection.id);
    const run = active?.kind === "delta" ? active : active ? null : await getLatestSizingRun(connection.id, "delta");
    const cancellable = run && (run.status === "blocked" || (run.status === "failed" && run.error !== SYNC_CANCELLED_MESSAGE));
    if (!run || !cancellable) {
      return Response.json(
        { error: "This sync is working right now and cannot be cancelled until it stops.", reason: "not_cancellable" },
        { status: 409 },
      );
    }
    await updateSizingRun(run.id, { status: "failed", error: SYNC_CANCELLED_MESSAGE });
    await releaseRunSyncProducts(run.id);
    return Response.json({ cancelled: run.id });
  } catch (error) {
    console.error("[store-connection sync/run/cancel POST]", error);
    return Response.json({ error: "Could not cancel the sync." }, { status: 500 });
  }
}
