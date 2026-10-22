import { advanceBlockedRun } from "@/lib/db/sizing-runs";
import { syncConnection } from "@/lib/sync/route-context";

/** Step 1 → step 2: the merchant has reviewed the sync's charts. Parks the run for its publish. */
export async function POST() {
  try {
    const { connection, response } = await syncConnection({ writing: true });
    if (response) return response;
    // `assign` too: stepping back from step 2 to review charts and continuing again is a no-op.
    const run = await advanceBlockedRun(connection.id, ["research", "gap_fill", "assign"], "assign", "delta");
    if (!run) {
      return Response.json(
        { error: "The sync is not waiting on its size charts.", reason: "not_at_research" },
        { status: 409 },
      );
    }
    return Response.json({ run });
  } catch (error) {
    console.error("[store-connection sync/run/continue POST]", error);
    return Response.json({ error: "Could not continue the sync." }, { status: 500 });
  }
}
