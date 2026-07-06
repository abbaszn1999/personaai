import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { randomUUID } from "crypto";
import { sendWelcomeEmail } from "@/modules/auth/lib/helpers";
import { sessionOptions, type SessionData } from "@/modules/auth/lib/session";
import { buildSessionProfile } from "@/modules/auth/lib/get-user";
import { getUserByEmail, markEmailVerified } from "@/lib/db/users";
import { createSession } from "@/lib/db/sessions";

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return Response.json({ error: "Email and code are required" }, { status: 400 });
    }

    const user = await getUserByEmail(email);

    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    if (user.email_verified) {
      return Response.json({ error: "Email already verified" }, { status: 400 });
    }

    if (user.email_verification_token !== code) {
      return Response.json({ error: "Invalid verification code" }, { status: 400 });
    }

    if (
      !user.email_verification_expiry ||
      new Date(user.email_verification_expiry) < new Date()
    ) {
      return Response.json({ error: "Verification code has expired" }, { status: 400 });
    }

    await markEmailVerified(user.id);

    // Create session
    const sid = randomUUID();
    const expire = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await createSession(user.id, sid, expire);

    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
    session.userId = user.id;
    session.sid = sid;
    session.hasCompletedOnboarding = user.has_completed_onboarding;
    // Mark email as verified in the cache
    session.profile = buildSessionProfile({ ...user, email_verified: true });
    await session.save();

    await sendWelcomeEmail(user.email, user.first_name);

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
    console.error("[verify-email]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
