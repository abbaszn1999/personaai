import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { getLatestSizingRun, updateSizingRun } from "@/lib/db/sizing-runs";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) return Response.json({ error: "Store connection not found" }, { status: 404 });

    const run = await getLatestSizingRun(connection.id);
    if (!run) return Response.json({ error: "Run sizing setup before publishing." }, { status: 409 });
    if (!["assign", "resolve", "publish"].includes(run.stage) && run.status !== "complete") {
      return Response.json({ error: "Finish Size Chart Research before publishing." }, { status: 409 });
    }
    if (run.status === "pending" || run.status === "running") return Response.json({ run });

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
