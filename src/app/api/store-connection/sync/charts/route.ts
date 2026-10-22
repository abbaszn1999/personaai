import { listSizingCoverage } from "@/lib/db/sizing-coverage";
import { listSizingPathCoverage } from "@/lib/db/sizing-path-coverage";
import { buildChartsView } from "@/lib/sizing/charts-view";
import { runProducts, scopedCoverageForRun } from "@/lib/sync/scope";
import { currentSyncRun, syncConnection } from "@/lib/sync/route-context";

/**
 * Step 1 of a sync: Setup's Size Chart Research, cut to the brands, sizing categories and leaves the
 * sync's products sit on. Charts are the store's own, so a chart saved here (through the Setup chart
 * route) sizes every product it covers, old and new.
 */
export async function GET() {
  try {
    const { connection, response } = await syncConnection();
    if (response) return response;
    const run = await currentSyncRun(connection.id);
    if (!run) return Response.json({ error: "There is no sync to review." }, { status: 409 });

    const [products, coverage, pathCoverage] = await Promise.all([
      runProducts(run),
      listSizingCoverage(connection.id),
      listSizingPathCoverage(connection.id),
    ]);
    const scoped = await scopedCoverageForRun(connection.id, products, coverage, pathCoverage);
    const view = await buildChartsView({
      connection,
      run,
      allCoverage: coverage,
      coverage: scoped.coverage,
      pathCoverage: scoped.pathCoverage,
    });
    if (!view.ok) return Response.json({ error: view.error }, { status: view.status });
    return Response.json(view.body);
  } catch (error) {
    console.error("[store-connection sync/charts GET]", error);
    return Response.json({ error: "Could not load the sync's size charts" }, { status: 500 });
  }
}
