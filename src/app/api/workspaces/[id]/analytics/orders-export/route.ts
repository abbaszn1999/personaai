import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getWorkspaceByIdForOwner } from "@/lib/db/workspaces";
import { analyticsWindow, parseAnalyticsRange } from "@/lib/db/analytics";
import { listLedgerEntriesInRange } from "@/lib/db/gmv";
import { attributedOrdersCsv } from "@/lib/analytics/persona-sales";

interface RouteParams { params: Promise<{ id: string }> }

/** Attributed order lines for the range. Order and product only, no shopper details. */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const workspace = await getWorkspaceByIdForOwner(id, user.id);
    if (!workspace) return Response.json({ error: "Project not found" }, { status: 404 });

    const range = parseAnalyticsRange(new URL(req.url).searchParams.get("range"));
    const { sinceIso, untilIso } = analyticsWindow(range);
    const entries = await listLedgerEntriesInRange(user.id, sinceIso, untilIso);

    return new Response(attributedOrdersCsv(entries), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="persona-orders-${sinceIso.slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[workspaces analytics/orders-export GET]", error);
    return Response.json({ error: "Unable to export orders" }, { status: 500 });
  }
}
