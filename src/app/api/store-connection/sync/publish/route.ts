import { summarizeGeneratedSizing } from "@/lib/catalog/acs/stage-five-preview";
import { updateSizingRun } from "@/lib/db/sizing-runs";
import { previewScopeFor, runProducts } from "@/lib/sync/scope";
import { liveSyncRun, syncConnection } from "@/lib/sync/route-context";

/**
 * Publishes a sync: writes its products to ACS under the catalog Setup published, and nothing else.
 * Same confirmation rule as Setup's publish — products without a chart go out only once the merchant
 * has seen exactly how many, counted over this sync's products as they resolve now.
 */
export async function POST(request: Request) {
  try {
    const { connection, response } = await syncConnection({ writing: true });
    if (response) return response;
    const live = await liveSyncRun(connection.id);
    if (live.response) return live.response;
    const { run } = live;
    if (run.stage === "publish") return Response.json({ run });
    if (!(run.status === "blocked" && (run.stage === "assign" || run.stage === "research" || run.stage === "gap_fill"))) {
      return Response.json({ error: "The sync is still reading its products. Wait until it finishes." }, { status: 409 });
    }

    const body = (await request.json().catch(() => ({}))) as { confirmUnresolved?: unknown };
    const products = await runProducts(run);
    const summary = await summarizeGeneratedSizing(connection, {
      mode: "current",
      scope: previewScopeFor(run, products),
    });
    if (!summary.brandMappingCurrent) {
      return Response.json(
        { error: "Map the sync's new brands before publishing.", reason: "brand_mapping" },
        { status: 409 },
      );
    }
    if (summary.unresolved > 0 && body.confirmUnresolved !== summary.unresolved) {
      return Response.json(
        {
          error: `${summary.unresolved.toLocaleString()} new product${summary.unresolved === 1 ? "" : "s"} would publish without a size chart. Confirm to publish anyway.`,
          requiresConfirmation: true,
          unresolved: summary.unresolved,
          total: summary.matched + summary.unresolved,
          groups: summary.unresolvedGroups,
        },
        { status: 409 },
      );
    }

    const queued = await updateSizingRun(run.id, {
      stage: "publish",
      status: "pending",
      error: null,
      phase: null,
      phaseDone: 0,
      phaseTotal: products.length,
    });
    if (!queued) return Response.json({ error: "Could not queue the sync's publish." }, { status: 500 });
    return Response.json({ run: queued });
  } catch (error) {
    console.error("[store-connection sync/publish POST]", error);
    return Response.json({ error: "Could not publish the sync." }, { status: 500 });
  }
}
