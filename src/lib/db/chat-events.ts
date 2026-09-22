import { db } from "@/lib/supabase/server";

export type ChatEventRole = "user" | "assistant";

export interface RecordChatEventInput {
  workspaceId: string;
  sessionId: string;
  role: ChatEventRole;
  topic?: string | null;
}

/** Logs one chat turn (a shopper message or an assistant reply) — see logChatEvent in
 *  use-shopping-agent.ts, the only caller. Powers the "Assistant Insights" card in
 *  src/lib/db/analytics.ts, mirroring how try-on-events.ts powers try-on insights. */
export async function recordChatEvent(input: RecordChatEventInput): Promise<void> {
  const { error } = await db.from("chat_events").insert({
    // `workspace_id` was dropped from this table — "workspace" and "owner" are the same
    // thing now, so this stays keyed on owner_id under the hood.
    owner_id: input.workspaceId,
    session_id: input.sessionId,
    role: input.role,
    topic: input.topic ?? null,
  });

  if (error) {
    console.error("[db/chat-events recordChatEvent]", error);
  }
}

export interface ChatEventRow {
  sessionId: string;
  role: ChatEventRole;
  topic: string | null;
  createdAt: string;
}

/** Raw rows for a workspace within [sinceIso, untilIso) — aggregated in application code by
 *  src/lib/db/analytics.ts, matching the same simple-JS-aggregation pattern as try_on_events. */
export async function getChatEventsInRange(
  workspaceId: string,
  sinceIso: string,
  untilIso: string
): Promise<ChatEventRow[]> {
  const { data, error } = await db
    .from("chat_events")
    .select("session_id, role, topic, created_at")
    .eq("owner_id", workspaceId)
    .gte("created_at", sinceIso)
    .lt("created_at", untilIso);

  if (error) {
    console.error("[db/chat-events getChatEventsInRange]", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    sessionId: row.session_id as string,
    role: row.role as ChatEventRole,
    topic: row.topic as string | null,
    createdAt: row.created_at as string,
  }));
}
