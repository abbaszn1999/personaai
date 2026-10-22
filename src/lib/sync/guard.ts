import { getActiveSizingRun } from "@/lib/db/sizing-runs";

/**
 * Refuses a Setup action while a sync of new products owns the store's one live run.
 *
 * Setup and Sync share `sizing_runs`, and its active-run index allows one live run per store. A
 * Setup scan, rewind or publish started now would either be handed the sync's run or move it, so
 * the merchant finishes or cancels the sync first.
 */
export async function refuseDuringSync(connectionId: string): Promise<Response | null> {
  const active = await getActiveSizingRun(connectionId);
  if (active?.kind !== "delta") return null;
  return Response.json(
    {
      error: "A sync of new products is in progress. Finish or cancel it on the Sync page first.",
      reason: "sync_in_progress",
    },
    { status: 409 },
  );
}
