import { getActiveSizingRun, getLatestSizingRun, updateSizingRun } from "@/lib/db/sizing-runs";
import { SYNC_CANCELLED_MESSAGE } from "@/lib/sync/constants";
import { syncConnection } from "@/lib/sync/route-context";

/**
 * Runs a failed sync's stage again. Each stage is idempotent over the products the run still holds,
 * so a retried publish writes only what the failed attempt did not.
 */
export async function POST() {
  try {
    const { connection, response } = await syncConnection({ writing: true });
    if (response) return response;
    if (await getActiveSizingRun(connection.id)) {
      return Response.json({ error: "Another run is in progress for this store.", reason: "run_in_progress" }, { status: 409 });
    }
    const run = await getLatestSizingRun(connection.id, "delta");
    if (!run || run.status !== "failed" || run.error === SYNC_CANCELLED_MESSAGE) {
      return Response.json({ error: "There is no failed sync to retry.", reason: "nothing_to_retry" }, { status: 409 });
    }
    const retried = await updateSizingRun(run.id, { status: "pending", error: null, phase: null });
    if (!retried) return Response.json({ error: "Could not retry the sync." }, { status: 500 });
    return Response.json({ run: retried });
  } catch (error) {
    console.error("[store-connection sync/run/retry POST]", error);
    return Response.json({ error: "Could not retry the sync." }, { status: 500 });
  }
}
