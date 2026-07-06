import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getSession } from "@/modules/auth/lib/get-user";
import { sessionOptions, type SessionData } from "@/modules/auth/lib/session";
import { getSessionsByUserId, deleteOtherSessionsForUser } from "@/lib/db/sessions";

export async function GET() {
  try {
    const session = await getSession();
    if (!session.userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await getSessionsByUserId(session.userId);

    const sessions = rows.map((s) => ({
      sid: s.sid,
      expire: s.expire,
      isCurrent: s.sid === session.sid,
    }));

    return Response.json({ sessions });
  } catch (err) {
    console.error("[account/sessions GET]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await getSession();
    if (!session.userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Delete all sessions for this user except the current one
    await deleteOtherSessionsForUser(session.userId, session.sid);

    // Re-save the current session to ensure the cookie stays valid
    const cookieStore = await cookies();
    const currentSession = await getIronSession<SessionData>(cookieStore, sessionOptions);
    await currentSession.save();

    return Response.json({ success: true });
  } catch (err) {
    console.error("[account/sessions DELETE]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
