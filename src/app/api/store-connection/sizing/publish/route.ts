import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { getSizingProductSnapshotHealth } from "@/lib/db/sizing-product-records";
import { getLatestSizingRun, rewindRun, updateSizingRun } from "@/lib/db/sizing-runs";
import { summarizeGeneratedSizing } from "@/lib/catalog/acs/stage-five-preview";
import { refuseDuringSetupReset } from "@/lib/catalog/setup-reset-guard";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) return Response.json({ error: "Store connection not found" }, { status: 404 });

    // A cleanup still deleting this store's documents would delete the new catalog with them.
    const resetting = refuseDuringSetupReset(connection);
    if (resetting) return resetting;

    const run = await getLatestSizingRun(connection.id);
    if (!run) return Response.json({ error: "Run sizing setup before publishing." }, { status: 409 });
    if (!["assign", "resolve", "publish"].includes(run.stage) && run.status !== "complete") {
      return Response.json({ error: "Finish Size Chart Research before publishing." }, { status: 409 });
    }
    if (run.status === "pending" || run.status === "running") return Response.json({ run });

    const snapshot = await getSizingProductSnapshotHealth(connection.id);
    if (!snapshot) {
      return Response.json({ error: "Could not validate the sizing product snapshot." }, { status: 500 });
    }
    const legacySnapshot =
      snapshot.total > 0 &&
      snapshot.missingPrimaryLeaf === snapshot.total &&
      snapshot.missingRawSizeFormat === snapshot.total;
    if (legacySnapshot) {
      const rescanning = await rewindRun(connection.id, "scan");
      if (!rescanning) {
        return Response.json(
          { error: "The saved sizing product data is incomplete and could not be queued for a fresh scan." },
          { status: 500 },
        );
      }
      return Response.json({
        run: rescanning,
        rescanning: true,
        message:
          "The saved sizing product data was incomplete. A fresh catalog scan has started so Preview and Publish use the same data.",
      }, { status: 202 });
    }

    // Publishing is allowed with products that have no chart, but only when the merchant has seen
    // exactly how many. The count comes from the same resolution the preview uses, rebuilt first if
    // any input changed since it was built, so a confirmation given against a stale number is
    // refused and re-asked.
    const body = (await request.json().catch(() => ({}))) as { confirmUnresolved?: unknown };
    const live = await summarizeGeneratedSizing(connection, { mode: "current" });
    if (live.unresolved > 0 && body.confirmUnresolved !== live.unresolved) {
      return Response.json(
        {
          error: `${live.unresolved.toLocaleString()} product${live.unresolved === 1 ? "" : "s"} would publish without a size chart. Confirm to publish anyway.`,
          requiresConfirmation: true,
          unresolved: live.unresolved,
          total: live.matched + live.unresolved,
          groups: live.unresolvedGroups,
        },
        { status: 409 },
      );
    }

    const queued = await updateSizingRun(run.id, {
      stage: "resolve",
      status: "pending",
      publishedAt: null,
      error: null,
      phase: null,
      phaseDone: 0,
      phaseTotal: null,
    });
    if (!queued) return Response.json({ error: "Could not queue sizing publish." }, { status: 500 });
    return Response.json({ run: queued });
  } catch (error) {
    console.error("[store-connection sizing/publish POST]", error);
    return Response.json({ error: "Could not publish sizing." }, { status: 500 });
  }
}
