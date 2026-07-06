import { db } from "@/lib/supabase/server";

export interface SessionSummary {
  sid: string;
  expire: string;
}

export async function createSession(userId: string, sid: string, expireAt: Date): Promise<void> {
  await db.from("sessions").insert({
    sid,
    sess: { userId },
    expire: expireAt.toISOString(),
  });
}

export async function getSessionsByUserId(userId: string): Promise<SessionSummary[]> {
  const { data, error } = await db
    .from("sessions")
    .select("sid, expire")
    .filter("sess->>userId", "eq", userId)
    .order("expire", { ascending: false });

  if (error) {
    console.error("[db/sessions getSessionsByUserId]", error);
    return [];
  }

  return data ?? [];
}

export async function deleteSessionBySid(sid: string): Promise<void> {
  await db.from("sessions").delete().eq("sid", sid);
}

export async function deleteOtherSessionsForUser(userId: string, keepSid: string): Promise<void> {
  await db.from("sessions").delete().filter("sess->>userId", "eq", userId).neq("sid", keepSid);
}

export async function deleteAllSessionsForUser(userId: string): Promise<void> {
  try {
    await db.from("sessions").delete().eq("sess->userId", userId);
  } catch {
    /* ignore — best-effort cleanup on account deletion */
  }
}
