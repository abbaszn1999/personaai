import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { listSizingProductRecordsPage } from "@/lib/db/sizing-product-records";
import {
  loadSizingResolutionContext,
  PRODUCT_CHART_STATUSES,
  resolveProductChart,
  type ProductChartStatus,
} from "@/lib/sizing/product-chart";

const PAGE_SIZE = 1_000;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) return Response.json({ error: "Store connection not found" }, { status: 404 });

    const context = await loadSizingResolutionContext(connection);
    const byStatus = Object.fromEntries(
      PRODUCT_CHART_STATUSES.map((status) => [status, 0]),
    ) as Record<ProductChartStatus, number>;
    const chartKeys = new Set<string>();
    const canonicalBrands = new Set<string>();
    const unmatched = new Map<string, { count: number; exampleSku: string | null }>();

    let offset = 0;
    let total = 0;
    do {
      const page = await listSizingProductRecordsPage(connection.id, {
        limit: PAGE_SIZE,
        offset,
      });
      total = page.total;
      for (const record of page.records) {
        const resolution = resolveProductChart(record, context);
        byStatus[resolution.status] += 1;
        if (resolution.canonicalBrandKey) canonicalBrands.add(resolution.canonicalBrandKey);
        if (resolution.status === "matched") chartKeys.add(resolution.chartKey);
        for (const label of resolution.unmatchedLabels) {
          const current = unmatched.get(label);
          unmatched.set(label, {
            count: (current?.count ?? 0) + 1,
            exampleSku: current?.exampleSku ?? record.sku,
          });
        }
      }
      offset += page.records.length;
      if (page.records.length === 0) break;
    } while (offset < total);

    const matched = byStatus.matched;
    return Response.json({
      total,
      matched,
      unresolved: total - matched,
      matchPercent: total === 0 ? 0 : Math.round((matched / total) * 10_000) / 100,
      byStatus,
      chartCount: chartKeys.size,
      canonicalBrandCount: canonicalBrands.size,
      unmatchedLabels: [...unmatched]
        .map(([label, detail]) => ({ label, ...detail }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
      brandMappingCurrent: context.brandMappingCurrent,
    });
  } catch (error) {
    console.error("[store-connection sizing/resolution-summary GET]", error);
    return Response.json({ error: "Could not resolve the sizing catalog" }, { status: 500 });
  }
}
