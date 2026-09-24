import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getWorkspaceByIdForOwner } from "@/lib/db/workspaces";
import { getWorkspaceAnalytics, parseAnalyticsRange } from "@/lib/db/analytics";

interface RouteParams { params: Promise<{ id: string }> }

/** Authenticated summary feeding the analytics dashboard — every number here is
 *  Persona-attributed (see src/lib/db/analytics.ts), never store-wide order data. */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace = await getWorkspaceByIdForOwner(id, user.id);
    if (!workspace) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    const range = parseAnalyticsRange(new URL(req.url).searchParams.get("range"));
    const payload = await getWorkspaceAnalytics(id, user.id, range);

    return Response.json(payload);
  } catch (err) {
    console.error("[workspaces analytics/summary GET]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
