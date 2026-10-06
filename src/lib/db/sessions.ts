import { db } from "@/lib/supabase/server";
import { forgetSessionValidity } from "@/modules/auth/lib/session-validity";

export interface SessionSummary {
  sid: string;
  expire: string;
}

export async function createSession(userId: string, sid: string, expireAt: Date): Promise<void> {
  const { error } = await db.from("sessions").insert({
    sid,
    sess: { userId },
    expire: expireAt.toISOString(),
  });
  // The cookie is only honoured while this row exists, so a failed insert is a failed sign-in.
  if (error) {
    console.error("[db/sessions createSession]", error);
    throw new Error("Could not start a session.");
  }
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

/** When the session started — rows are written with a fixed lifetime, so start = expire − lifetime. */
export async function getSessionStartedAt(sid: string, lifetimeMs: number): Promise<number | null> {
  const { data, error } = await db.from("sessions").select("expire").eq("sid", sid).maybeSingle();
  if (error || !data?.expire) return null;
  return Date.parse(data.expire as string) - lifetimeMs;
}

export async function deleteSessionBySid(sid: string): Promise<void> {
  await db.from("sessions").delete().eq("sid", sid);
  forgetSessionValidity([sid]);
}

export async function deleteOtherSessionsForUser(userId: string, keepSid: string): Promise<void> {
  const { data, error } = await db
    .from("sessions")
    .delete()
    .filter("sess->>userId", "eq", userId)
    .neq("sid", keepSid)
    .select("sid");
  if (error) console.error("[db/sessions deleteOtherSessionsForUser]", error);
  forgetSessionValidity(((data as Array<{ sid: string }> | null) ?? []).map((row) => row.sid));
}

export async function deleteAllSessionsForUser(userId: string): Promise<void> {
  const { data, error } = await db
    .from("sessions")
    .delete()
    .filter("sess->>userId", "eq", userId)
    .select("sid");
  if (error) console.error("[db/sessions deleteAllSessionsForUser]", error);
  forgetSessionValidity(((data as Array<{ sid: string }> | null) ?? []).map((row) => row.sid));
}
