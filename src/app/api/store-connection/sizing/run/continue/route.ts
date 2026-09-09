import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { resumeBlockedRun } from "@/lib/db/sizing-runs";

/**
 * Unblocks the pipeline's current stage — what a merchant clicking "Continue" past a stage that
 * spends real money (classify -> research today; more will follow as later phases land) does on
 * the server. Kept as its own route rather than a body flag on `POST /sizing/run`, since that route
 * *starts* a run and this one only ever advances an existing one; conflating them would make one
 * endpoint mean two different things depending on a hidden parameter.
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

    const run = await resumeBlockedRun(connection.id);
    if (!run) {
      // Not an error: the run may already have been resumed by an earlier click, or may not be
      // blocked yet because the previous stage is still running. Either way there is nothing to do.
      return Response.json({ run: null });
    }

    return Response.json({ run });
  } catch (err) {
    console.error("[store-connection sizing/run/continue POST]", err);
    return Response.json({ error: "Could not continue the sizing run" }, { status: 500 });
  }
}
