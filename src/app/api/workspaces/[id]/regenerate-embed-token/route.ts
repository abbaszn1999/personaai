import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { regenerateEmbedToken } from "@/lib/db/workspaces";

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const embedToken = await regenerateEmbedToken(id, user.id);
    if (!embedToken) {
      return Response.json({ error: "Project not found or update failed" }, { status: 404 });
    }

    return Response.json({ embedToken });
  } catch (err) {
    console.error("[workspaces regenerate-embed-token POST]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
