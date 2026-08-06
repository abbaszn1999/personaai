import { NextRequest } from "next/server";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedJson, embedOptions } from "@/lib/embed/cors";
import { recordChatEvent, type ChatEventRole } from "@/lib/db/chat-events";

interface RequestBody {
  embedToken?: string;
  sessionId?: string;
  role?: string;
  topic?: string;
}

const VALID_ROLES: ChatEventRole[] = ["user", "assistant"];

export async function OPTIONS() {
  return embedOptions();
}

/**
 * Public, unauthenticated log of one chat turn (a shopper message or an assistant reply) —
 * fired from the shopper's own browser right after the turn is sent/completed. Powers the
 * "Messages Sent" usage metric and the "Assistant Insights" card on the analytics page.
 * Mode-agnostic (both the unwearable Shopping Assistant and the wearable Style Assistant log
 * here), mirroring try-on-event / cart-event.
 */
export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json().catch(() => ({}));

    const resolution = await resolveEmbedRequest(body.embedToken);
    if ("error" in resolution) return resolution.error;
    const { workspace } = resolution;

    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const role = typeof body.role === "string" && VALID_ROLES.includes(body.role as ChatEventRole)
      ? (body.role as ChatEventRole)
      : null;
    const topic = typeof body.topic === "string" && body.topic.trim() ? body.topic.trim() : null;

    if (!sessionId || !role) {
      return embedJson({ error: "Missing required chat event fields" }, { status: 400 });
    }

    await recordChatEvent({
      workspaceId: workspace.workspaceId,
      sessionId,
      role,
      topic,
    });

    return embedJson({ ok: true });
  } catch (err) {
    console.error("[api/embed/chat-event POST]", err);
    return embedJson({ error: "Internal server error" }, { status: 500 });
  }
}
