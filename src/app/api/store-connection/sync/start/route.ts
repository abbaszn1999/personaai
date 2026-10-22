import { hasApprovedCurrentMapping } from "@/lib/catalog/acs/field-overrides";
import { MAPPER_VERSION } from "@/lib/catalog/acs/map-product";
import {
  createSizingRun,
  failSizingRun,
  getActiveSizingRun,
  getLatestPublishedSizingRun,
  getLatestSizingRun,
} from "@/lib/db/sizing-runs";
import {
  claimPendingSyncProducts,
  listSyncProducts,
  releaseRunSyncProducts,
} from "@/lib/db/sync-new-products";
import { syncConnection } from "@/lib/sync/route-context";

/**
 * "Sync items now": starts a delta run over every product waiting in the queue.
 *
 * The run reuses everything Setup saved — field mapping, Persona map, size settings, brand types,
 * brand mapping and charts — and its scan reads only these products. Nothing runs in the request;
 * the sizing worker picks the run up on its next tick, as it does for Setup.
 */
export async function POST() {
  try {
    const { connection, response } = await syncConnection({ writing: true });
    if (response) return response;

    if (!(await getLatestPublishedSizingRun(connection.id))) {
      return Response.json(
        { error: "Publish your catalog from Setup first.", reason: "not_published" },
        { status: 409 },
      );
    }
    if (!hasApprovedCurrentMapping(connection, MAPPER_VERSION)) {
      return Response.json(
        { error: "The field mapping changed since Setup. Approve it in Setup before syncing.", reason: "mapping_not_approved" },
        { status: 409 },
      );
    }

    const active = await getActiveSizingRun(connection.id);
    if (active?.kind === "delta") return Response.json({ run: active });
    if (active) {
      return Response.json(
        { error: "Setup is running for this store. Finish it before syncing new products.", reason: "setup_in_progress" },
        { status: 409 },
      );
    }

    // A sync that failed still holds its products; they rejoin the queue so this sync takes them.
    const previous = await getLatestSizingRun(connection.id, "delta");
    if (previous?.status === "failed") await releaseRunSyncProducts(previous.id);

    const waiting = await listSyncProducts(connection.id, { statuses: ["pending"], limit: 1 });
    if (waiting.total === 0) {
      return Response.json({ error: "There are no new products to sync.", reason: "nothing_pending" }, { status: 409 });
    }

    const run = await createSizingRun(connection.id, "delta");
    if (!run) return Response.json({ error: "Could not start the sync." }, { status: 500 });
    if (run.kind !== "delta") {
      return Response.json(
        { error: "Setup is running for this store. Finish it before syncing new products.", reason: "setup_in_progress" },
        { status: 409 },
      );
    }

    const claimed = await claimPendingSyncProducts(connection.id, run.id);
    if (claimed === 0) {
      await failSizingRun(run.id, "There were no new products left to sync.");
      return Response.json({ error: "There are no new products to sync.", reason: "nothing_pending" }, { status: 409 });
    }
    return Response.json({ run, claimed });
  } catch (error) {
    console.error("[store-connection sync/start POST]", error);
    return Response.json({ error: "Could not start the sync." }, { status: 500 });
  }
}
