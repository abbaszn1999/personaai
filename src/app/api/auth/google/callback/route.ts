import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { randomUUID } from "crypto";
import { verifyState, exchangeCodeForProfile } from "@/modules/auth/lib/google";
import { sessionOptions, type SessionData } from "@/modules/auth/lib/session";
import { buildSessionProfile } from "@/modules/auth/lib/get-user";
import { getUserByEmail, createGoogleUser, linkGoogleAccount } from "@/lib/db/users";
import { createSession } from "@/lib/db/sessions";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return Response.redirect(`${APP_URL}/sign-in?error=google_cancelled`);
    }

    if (!code || !state) {
      return Response.redirect(`${APP_URL}/sign-in?error=google_invalid`);
    }

    if (!verifyState(state)) {
      return Response.redirect(`${APP_URL}/sign-in?error=google_csrf`);
    }

    const profile = await exchangeCodeForProfile(code);

    // Check if a user with this email already exists
    let user = await getUserByEmail(profile.email);

    if (user) {
      // Link Google ID to existing account
      await linkGoogleAccount(user.id, {
        googleId: profile.googleId,
        profileImageUrl: profile.profileImageUrl ?? user.profile_image_url,
      });
    } else {
      // Create new Google user
      const newUser = await createGoogleUser({
        email: profile.email,
        googleId: profile.googleId,
        firstName: profile.firstName ?? null,
        lastName: profile.lastName ?? null,
        profileImageUrl: profile.profileImageUrl ?? null,
      });

      if (!newUser) {
        return Response.redirect(`${APP_URL}/sign-in?error=google_failed`);
      }
      user = newUser;
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
    // Cache profile — apply Google-updated fields
    const freshUser = {
      ...user,
      google_id: profile.googleId,
      profile_image_url: profile.profileImageUrl ?? user.profile_image_url,
      email_verified: true,
    };
    session.profile = buildSessionProfile(freshUser);
    await session.save();

    const dest = user.has_completed_onboarding ? "/" : "/onboarding";
    return Response.redirect(`${APP_URL}${dest}`);
  } catch (err) {
    console.error("[google/callback]", err);
    return Response.redirect(`${APP_URL}/sign-in?error=google_failed`);
  }
}
