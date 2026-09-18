import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { advanceBlockedRun } from "@/lib/db/sizing-runs";

/**
 * Moves a parked run on to the next stage — what "Continue" records server-side.
 *
 * It no longer starts anything, and that is the change. Continuing past Stage 3 used to be the
 * authorisation to spend on chart research, so one press meant both "I have read the brand list" and
 * "search every one of them". Stage 4 now owns the second half of that decision, per brand
 * (`POST /sizing/research`), so this endpoint's only job is to record where the merchant got to.
 *
 * Deliberately stage-aware rather than taking a target from the client: the pipeline's order is a
 * server fact, and a body parameter would let a client skip `assign` — the stage that decides which
 * chart governs which products — by naming a later one.
 */
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) {
      return Response.json({ error: "Store connection not found" }, { status: 404 });
    }

    // `gap_fill` is included because runs parked there predate Stage 4 owning its own parked state.
    // They belong on the assignment stage too, and leaving them out would strand exactly the runs that
    // finished research before this change.
    const run = await advanceBlockedRun(connection.id, ["research", "gap_fill"], "assign");
    if (!run) {
      // Not an error: the run may already have been advanced by an earlier click, or may not be parked
      // yet because the stage before it is still working. Either way there is nothing to do.
      return Response.json({ run: null });
    }

    return Response.json({ run });
  } catch (err) {
    console.error("[store-connection sizing/run/continue POST]", err);
    return Response.json({ error: "Could not continue the sizing run" }, { status: 500 });
  }
}
