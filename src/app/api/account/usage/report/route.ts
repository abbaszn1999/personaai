import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { queryUsageReport, queryUsageSessions } from "@/lib/db/usage-report";
import {
  changePercent,
  enumerateBuckets,
  fillSeries,
  toolBreakdown,
  totalCostNanos,
} from "@/lib/billing/usage-report";
import { resolveUsageRequest } from "../resolve";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const resolved = await resolveUsageRequest(user.id, req.nextUrl.searchParams);
    if ("error" in resolved) return Response.json({ error: resolved.error }, { status: resolved.status });
    const { range } = resolved;

    const [current, previous, shoppers, previousShoppers] = await Promise.all([
      queryUsageReport({
        ownerId: user.id,
        fromIso: range.from.toISOString(),
        toIso: range.to.toISOString(),
        bucket: range.bucket,
        timeZone: range.timeZone,
        source: range.source,
      }),
      queryUsageReport({
        ownerId: user.id,
        fromIso: range.previousFrom.toISOString(),
        toIso: range.previousTo.toISOString(),
        bucket: range.bucket,
        timeZone: range.timeZone,
        source: range.source,
      }),
      queryUsageSessions({
        ownerId: user.id,
        fromIso: range.from.toISOString(),
        toIso: range.to.toISOString(),
        source: range.source,
        tool: range.tool,
        limit: 1,
        offset: 0,
      }),
      queryUsageSessions({
        ownerId: user.id,
        fromIso: range.previousFrom.toISOString(),
        toIso: range.previousTo.toISOString(),
        source: range.source,
        tool: range.tool,
        limit: 1,
        offset: 0,
      }),
    ]);

    const filtered = current.filter((row) => range.tool === "all" || row.tool === range.tool);
    const previousFiltered = previous.filter((row) => range.tool === "all" || row.tool === range.tool);
    const buckets = enumerateBuckets(range.from.toISOString(), range.to.toISOString(), range.bucket, range.timeZone);
    const spendNanos = totalCostNanos(filtered);
    const previousSpendNanos = totalCostNanos(previousFiltered);

    return Response.json(
      {
        generatedAt: new Date().toISOString(),
        range: {
          preset: range.preset,
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          previousFrom: range.previousFrom.toISOString(),
          previousTo: range.previousTo.toISOString(),
          bucket: range.bucket,
          source: range.source,
          tool: range.tool,
          timeZone: range.timeZone,
        },
        spendNanos,
        previousSpendNanos,
        changePercent: changePercent(spendNanos, previousSpendNanos),
        shopperCount: shoppers.shopperCount,
        previousShopperCount: previousShoppers.shopperCount,
        seriesNanos: fillSeries(filtered, buckets, "nanos"),
        seriesUnits: fillSeries(filtered, buckets, "units"),
        tools: toolBreakdown(filtered, previousFiltered),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[api/account/usage/report GET]", error);
    return Response.json({ error: "Unable to load usage" }, { status: 500 });
  }
}
