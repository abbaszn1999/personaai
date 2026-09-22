import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getWorkspaceByIdForOwner } from "@/lib/db/workspaces";
import { recordChatEvent, type ChatEventRole } from "@/lib/db/chat-events";

interface RequestBody {
  workspaceId?: string;
  sessionId?: string;
  role?: string;
  topic?: string;
}

const VALID_ROLES: ChatEventRole[] = ["user", "assistant"];

/**
 * Authenticated counterpart to `/api/embed/chat-event` — logs one chat turn from the
 * dashboard preview so Assistant Insights includes a merchant testing their own store.
 * Session-unit billing is settled on the chat route, not from these rows.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body: RequestBody = await req.json().catch(() => ({}));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const role = typeof body.role === "string" && VALID_ROLES.includes(body.role as ChatEventRole)
      ? (body.role as ChatEventRole)
      : null;
    const topic = typeof body.topic === "string" && body.topic.trim() ? body.topic.trim() : null;

    if (!workspaceId || !sessionId || !role) {
      return Response.json({ error: "Missing required chat event fields" }, { status: 400 });
    }

    const workspace = await getWorkspaceByIdForOwner(workspaceId, user.id);
    if (!workspace) return Response.json({ error: "Workspace not found" }, { status: 404 });

    await recordChatEvent({ workspaceId, sessionId, role, topic });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[api/agents/chat-event POST]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
