import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { rewindRun } from "@/lib/db/sizing-runs";

/**
 * Sends the live run back to the catalog scan.
 *
 * Distinct from `POST /sizing/run`, which *starts* a run and 409s while one is open — that is
 * correct for a double-clicked "Start" and useless when the merchant's actual intent is "do it all
 * again". Without a rewind, a connection whose coverage was built by an older version of the
 * scanner could only be fixed by deleting its run in SQL.
 *
 * Cheaper than it looks: `replaceSizingCoverage` carries `brand_type` across by brand, so a re-scan
 * does not re-pay for classification of brands already classified, and `sizing_charts` is untouched
 * so the registry short-circuit still applies. What it does re-establish is coverage itself, which
 * is what has to change when the sizing key vocabulary does.
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

    const run = await rewindRun(connection.id, "scan");
    if (!run) {
      return Response.json(
        { error: "This connection has no run in progress to restart.", reason: "no_live_run" },
        { status: 409 }
      );
    }

    return Response.json({ run });
  } catch (err) {
    console.error("[store-connection sizing/run/restart POST]", err);
    return Response.json({ error: "Could not restart the sizing run" }, { status: 500 });
  }
}
