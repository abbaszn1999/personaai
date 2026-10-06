import { randomBytes, timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const REDIRECT_URI = `${APP_URL}/api/auth/google/callback`;

/**
 * The CSRF `state` round-trips through the browser in an httpOnly cookie rather than server memory,
 * so the callback verifies it whichever server instance it lands on (and after a restart).
 * `SameSite=Lax` is still sent on Google's top-level redirect back to the callback.
 */
export const GOOGLE_STATE_COOKIE = "persona-oauth-state";
export const GOOGLE_STATE_TTL_SECONDS = 10 * 60;

export function buildGoogleAuthUrl(): { url: string; state: string } {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Google OAuth not configured");
  }
  const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  const state = randomBytes(32).toString("hex");

  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });
  return { url, state };
}

export function verifyState(returned: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const a = Buffer.from(returned);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
}

export async function exchangeCodeForProfile(
  code: string
): Promise<GoogleProfile> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Google OAuth not configured");
  }
  const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token!,
    audience: CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) throw new Error("Invalid Google token");

  return {
    googleId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    firstName: payload.given_name,
    lastName: payload.family_name,
    profileImageUrl: payload.picture,
  };
}
