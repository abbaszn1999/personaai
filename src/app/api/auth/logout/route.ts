import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/modules/auth/lib/session";
import { applySessionHint } from "@/modules/auth/lib/session-hint";
import { deleteSessionBySid } from "@/lib/db/sessions";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (session.sid) {
      await deleteSessionBySid(session.sid);
    }

    session.destroy();
    const res = NextResponse.json({ success: true });
    applySessionHint(res, false);
    return res;
  } catch (err) {
    console.error("[logout]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
