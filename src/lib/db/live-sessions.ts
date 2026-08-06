import { db } from "@/lib/supabase/server";

/** A session is considered "live" if it heartbeated within this window — matches the
 *  ~15s client heartbeat interval with enough slack for one missed beat. */
const LIVE_WINDOW_SECONDS = 30;

/** Upserts this shopper's heartbeat row, refreshing `last_seen_at` to now. Called from the
 *  public `/api/embed/heartbeat` route on every heartbeat tick from an embedded widget. */
export async function recordHeartbeat(workspaceId: string, sessionId: string): Promise<void> {
  const { error } = await db
    .from("workspace_live_sessions")
    .upsert(
      {
        workspace_id: workspaceId,
        session_id: sessionId,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,session_id" }
    );

  if (error) {
    console.error("[db/live-sessions recordHeartbeat]", error);
  }
}

/** Counts shoppers currently viewing this workspace's embedded widget — i.e. rows whose
 *  last heartbeat is still within the live window. No cleanup job needed: rows that fall
 *  outside the window are just excluded here, and get overwritten if that shopper returns. */
export async function countLiveSessions(workspaceId: string): Promise<number> {
  const cutoff = new Date(Date.now() - LIVE_WINDOW_SECONDS * 1000).toISOString();

  const { count, error } = await db
    .from("workspace_live_sessions")
    .select("session_id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .gt("last_seen_at", cutoff);

  if (error) {
    console.error("[db/live-sessions countLiveSessions]", error);
    return 0;
  }

  return count ?? 0;
}

export interface LiveSessionRow {
  sessionId: string;
  startedAt: string;
  lastSeenAt: string;
}

/**
 * Raw session rows relevant to an analytics window: anything active at any point during
 * [sinceIso, untilIso) — either opened for the first time in-window (`started_at` in range)
 * or still around from before and heartbeating during it (`last_seen_at` in range).
 * src/lib/db/analytics.ts splits these into "new" vs "returning" and buckets by day.
 */
export async function getSessionRowsForRange(
  workspaceId: string,
  sinceIso: string,
  untilIso: string
): Promise<LiveSessionRow[]> {
  const { data, error } = await db
    .from("workspace_live_sessions")
    .select("session_id, started_at, last_seen_at")
    .eq("workspace_id", workspaceId)
    .lt("started_at", untilIso)
    .gte("last_seen_at", sinceIso);

  if (error) {
    console.error("[db/live-sessions getSessionRowsForRange]", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    sessionId: row.session_id as string,
    startedAt: row.started_at as string,
    lastSeenAt: row.last_seen_at as string,
  }));
}
