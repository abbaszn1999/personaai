import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { queryUsageReport, queryUsageSessions } from "@/lib/db/usage-report";
import { usageCsv } from "@/lib/billing/usage-report";
import { resolveUsageRequest } from "../resolve";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const resolved = await resolveUsageRequest(user.id, req.nextUrl.searchParams);
    if ("error" in resolved) return Response.json({ error: resolved.error }, { status: resolved.status });
    const { range } = resolved;

    const [rows, sessions] = await Promise.all([
      queryUsageReport({
        ownerId: user.id,
        fromIso: range.from.toISOString(),
        toIso: range.to.toISOString(),
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
        limit: 1000,
        offset: 0,
      }),
    ]);

    const filtered = rows.filter((row) => range.tool === "all" || row.tool === range.tool);
    const csv = usageCsv({ rows: filtered, shoppers: sessions.shoppers });
    const stamp = range.from.toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="usage-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[api/account/usage/export GET]", error);
    return Response.json({ error: "Unable to export usage" }, { status: 500 });
  }
}
