import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { randomUUID } from "crypto";
import { verifyPassword, generateCode, sendVerificationEmail } from "@/modules/auth/lib/helpers";
import { sessionOptions, type SessionData } from "@/modules/auth/lib/session";
import { buildSessionProfile } from "@/modules/auth/lib/get-user";
import { getUserByEmail, setEmailVerificationCode } from "@/lib/db/users";
import { createSession } from "@/lib/db/sessions";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return Response.json({ error: "Email and password are required" }, { status: 400 });
    }

    const user = await getUserByEmail(email);

    if (!user) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Google-only account — no password
    if (!user.password_hash) {
      return Response.json({ error: "Please sign in with Google", useGoogle: true }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Unverified email — re-send code and ask to verify
    if (!user.email_verified) {
      const code = generateCode();
      const expiry = new Date(Date.now() + 60 * 60 * 1000);
      await setEmailVerificationCode(user.id, code, expiry.toISOString());
      await sendVerificationEmail(user.email, code);
      return Response.json({ error: "Email not verified", requiresVerification: true }, { status: 403 });
    }

    // Create session
    const sid = randomUUID();
    const expire = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await createSession(user.id, sid, expire);

    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
    session.userId = user.id;
    session.sid = sid;
    session.hasCompletedOnboarding = user.has_completed_onboarding;
    session.profile = buildSessionProfile(user);
    await session.save();

    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        hasCompletedOnboarding: user.has_completed_onboarding,
      },
    });
  } catch (err) {
    console.error("[login]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
