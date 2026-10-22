import { summarizeGeneratedSizing } from "@/lib/catalog/acs/stage-five-preview";
import { PRODUCT_CHART_STATUSES, type ProductChartStatus } from "@/lib/sizing/product-chart";
import { previewScopeFor, runProducts } from "@/lib/sync/scope";
import { currentSyncRun, syncConnection } from "@/lib/sync/route-context";

/** Step 2's summary: Setup's Active Overview numbers, over the sync's products only. */
export async function GET() {
  try {
    const { connection, response } = await syncConnection();
    if (response) return response;
    const run = await currentSyncRun(connection.id);
    if (!run) return Response.json({ error: "There is no sync to review." }, { status: 409 });

    const products = await runProducts(run);
    const live = await summarizeGeneratedSizing(connection, { scope: previewScopeFor(run, products) });
    const byStatus = Object.fromEntries(
      PRODUCT_CHART_STATUSES.map((status) => [status, live.byStatus[status] ?? 0]),
    ) as Record<ProductChartStatus, number>;
    const evaluated = live.matched + live.unresolved;

    return Response.json({
      total: evaluated,
      variantCount: live.variantCount,
      matched: live.matched,
      unresolved: live.unresolved,
      excluded: live.excluded,
      unsized: live.unsized ?? 0,
      matchPercent: evaluated === 0 ? 0 : Math.round((live.matched / evaluated) * 10_000) / 100,
      byStatus,
      unresolvedGroups: live.unresolvedGroups,
      chartCount: live.chartKeys.length,
      canonicalBrandCount: live.canonicalBrandKeys.length,
      unmatchedLabels: [],
      brandMappingCurrent: live.brandMappingCurrent,
      unavailable: live.unavailable,
      withoutImage: live.withoutImage ?? 0,
      builtAt: live.builtAt,
      refreshing: live.refreshing,
    });
  } catch (error) {
    console.error("[store-connection sync/resolution-summary GET]", error);
    return Response.json({ error: "Could not resolve the sync's products" }, { status: 500 });
  }
}
