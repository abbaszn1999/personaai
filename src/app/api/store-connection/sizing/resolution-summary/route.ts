import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { summarizeGeneratedSizing } from "@/lib/catalog/acs/stage-five-preview";
import { getLatestSizingRun } from "@/lib/db/sizing-runs";
import {
  PRODUCT_CHART_STATUSES,
  type ProductChartStatus,
} from "@/lib/sizing/product-chart";

/**
 * Always the live resolution, before and after a publish. The published branch used to resolve the
 * stored scan snapshot instead, which skips the merchant's category scope and the live variant
 * sizes, so the same screen could show different numbers than the table beneath it and the publish
 * that follows.
 *
 * Answered from the last build when one exists; `refreshing` says a newer one is on its way, and the
 * screen re-asks until it lands.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) return Response.json({ error: "Store connection not found" }, { status: 404 });

    const [live, run] = await Promise.all([summarizeGeneratedSizing(connection), getLatestSizingRun(connection.id)]);
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
      matchPercent: evaluated === 0 ? 0 : Math.round((live.matched / evaluated) * 10_000) / 100,
      byStatus,
      unresolvedGroups: live.unresolvedGroups,
      chartCount: live.chartKeys.length,
      canonicalBrandCount: live.canonicalBrandKeys.length,
      unmatchedLabels: [],
      brandMappingCurrent: live.brandMappingCurrent,
      unavailable: live.unavailable,
      // Left out at the scan, plus any that lost their last image since.
      withoutImage: (run?.productsWithoutImage ?? 0) + (live.withoutImage ?? 0),
      builtAt: live.builtAt,
      refreshing: live.refreshing,
    });
  } catch (error) {
    console.error("[store-connection sizing/resolution-summary GET]", error);
    return Response.json({ error: "Could not resolve the sizing catalog" }, { status: 500 });
  }
}
