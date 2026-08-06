import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getWorkspaceByIdForOwner } from "@/lib/db/workspaces";
import { countLiveSessions } from "@/lib/db/live-sessions";

interface RouteParams { params: Promise<{ id: string }> }

/** Authenticated live count for the analytics page's eye icon — how many shoppers are
 *  currently viewing this workspace's embedded widget right now (see
 *  src/lib/db/live-sessions.ts for how "live" is derived from heartbeat rows). */
export async function GET(_req: Request, { params }: RouteParams) {
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

    const count = await countLiveSessions(id);

    return Response.json({ count });
  } catch (err) {
    console.error("[workspaces live-sessions GET]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
