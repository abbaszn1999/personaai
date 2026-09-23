import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { queryUsageSessions } from "@/lib/db/usage-report";
import { resolveUsageRequest } from "../resolve";

const PAGE_SIZE = 25;

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const resolved = await resolveUsageRequest(user.id, req.nextUrl.searchParams);
    if ("error" in resolved) return Response.json({ error: resolved.error }, { status: resolved.status });
    const { range } = resolved;
    const sessionId = req.nextUrl.searchParams.get("sessionId");
    const page = Math.max(0, Number.parseInt(req.nextUrl.searchParams.get("page") ?? "0", 10) || 0);

    const result = await queryUsageSessions({
      ownerId: user.id,
      fromIso: range.from.toISOString(),
      toIso: range.to.toISOString(),
      source: range.source,
      tool: range.tool,
      limit: sessionId ? 1 : PAGE_SIZE,
      offset: sessionId ? 0 : page * PAGE_SIZE,
      sessionId,
    });

    return Response.json(
      {
        shoppers: result.shoppers,
        shopperCount: result.shopperCount,
        page: sessionId ? 0 : page,
        pageSize: PAGE_SIZE,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[api/account/usage/sessions GET]", error);
    return Response.json({ error: "Unable to load shoppers" }, { status: 500 });
  }
}
