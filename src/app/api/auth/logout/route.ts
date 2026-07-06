import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/modules/auth/lib/session";
import { deleteSessionBySid } from "@/lib/db/sessions";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (session.sid) {
      await deleteSessionBySid(session.sid);
    }

    session.destroy();
    return Response.json({ success: true });
  } catch (err) {
    console.error("[logout]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
