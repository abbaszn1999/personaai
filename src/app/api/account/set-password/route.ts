import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { hashPassword } from "@/modules/auth/lib/helpers";
import { sessionOptions, type SessionData } from "@/modules/auth/lib/session";
import { getPasswordHash, setPassword } from "@/lib/db/users";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { password } = await req.json();

    if (!password || password.length < 8) {
      return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Verify no password already exists (first-time set only)
    const existingHash = await getPasswordHash(user.id);
    if (existingHash) {
      return Response.json({ error: "Use change-password to update an existing password" }, { status: 400 });
    }

    const hash = await hashPassword(password);
    await setPassword(user.id, hash);

    // Update session cache — hasPassword is now true
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
    if (session.profile) {
      session.profile.hasPassword = true;
      session.profile.provider = "credentials";
      await session.save();
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("[account/set-password]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
