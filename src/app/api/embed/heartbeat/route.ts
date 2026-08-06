import { NextRequest } from "next/server";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedJson, embedOptions } from "@/lib/embed/cors";
import { recordHeartbeat } from "@/lib/db/live-sessions";

interface RequestBody {
  embedToken?: string;
  sessionId?: string;
}

export async function OPTIONS() {
  return embedOptions();
}

/**
 * Public, unauthenticated "I'm still here" ping sent every ~15s by an embedded widget while
 * mounted. Powers the merchant-facing live session count on the analytics page — see
 * countLiveSessions in src/lib/db/live-sessions.ts for how "live" is derived from these rows.
 */
export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json().catch(() => ({}));

    const resolution = await resolveEmbedRequest(body.embedToken);
    if ("error" in resolution) return resolution.error;
    const { workspace } = resolution;

    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    if (!sessionId) {
      return embedJson({ error: "Missing session id" }, { status: 400 });
    }

    await recordHeartbeat(workspace.workspaceId, sessionId);

    return embedJson({ ok: true });
  } catch (err) {
    console.error("[api/embed/heartbeat POST]", err);
    return embedJson({ error: "Internal server error" }, { status: 500 });
  }
}
