import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { randomUUID } from "crypto";
import {
  exchangeCodeForProfile,
  GOOGLE_STATE_COOKIE,
  verifyState,
} from "@/modules/auth/lib/google";
import { sessionOptions, type SessionData } from "@/modules/auth/lib/session";
import { buildSessionProfile } from "@/modules/auth/lib/get-user";
import { getUserByEmail, createGoogleUser, linkGoogleAccount } from "@/lib/db/users";
import { createSession } from "@/lib/db/sessions";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

function redirectTo(path: string): NextResponse {
  const res = NextResponse.redirect(`${APP_URL}${path}`);
  // Single use, whatever the outcome.
  res.cookies.set(GOOGLE_STATE_COOKIE, "", { path: "/api/auth/google", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return redirectTo("/sign-in?error=google_cancelled");
    }

    if (!code || !state) {
      return redirectTo("/sign-in?error=google_invalid");
    }

    if (!verifyState(state, req.cookies.get(GOOGLE_STATE_COOKIE)?.value)) {
      return redirectTo("/sign-in?error=google_csrf");
    }

    const profile = await exchangeCodeForProfile(code);
    // Only an address Google itself has verified proves the person owns the inbox.
    if (!profile.emailVerified) {
      return redirectTo("/sign-in?error=google_unverified");
    }

    // Check if a user with this email already exists
    let user = await getUserByEmail(profile.email);

    if (user) {
      // Keep a photo already on the account (including an upload). Google's
      // picture is used only when the account has none yet.
      const profileImageUrl = user.profile_image_url || profile.profileImageUrl || null;
      // An unverified password account on this address was opened by whoever typed it in. Google
      // has just proved who owns the inbox, so that password stops working here.
      const revokePassword = !user.email_verified && Boolean(user.password_hash);
      await linkGoogleAccount(user.id, {
        googleId: profile.googleId,
        profileImageUrl,
        revokePassword,
      });
      user = {
        ...user,
        profile_image_url: profileImageUrl,
        ...(revokePassword ? { password_hash: null, provider: "google" } : {}),
      };
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
        return redirectTo("/sign-in?error=google_failed");
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
      profile_image_url: user.profile_image_url,
      email_verified: true,
    };
    session.profile = buildSessionProfile(freshUser);
    await session.save();

    // Same destination as an email sign-in.
    return redirectTo(user.has_completed_onboarding ? "/dashboard" : "/onboarding");
  } catch (err) {
    console.error("[google/callback]", err);
    return redirectTo("/sign-in?error=google_failed");
  }
}
