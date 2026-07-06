import { OAuth2Client } from "google-auth-library";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const REDIRECT_URI = `${APP_URL}/api/auth/google/callback`;

// In-memory CSRF state map with 10-min TTL (matches reference architecture)
const stateMap = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000;

function pruneExpiredStates() {
  const now = Date.now();
  for (const [key, ts] of stateMap.entries()) {
    if (now - ts > STATE_TTL_MS) stateMap.delete(key);
  }
}

export function buildGoogleAuthUrl(): string {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Google OAuth not configured");
  }
  const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  const state = crypto.randomUUID();
  pruneExpiredStates();
  stateMap.set(state, Date.now());

  return client.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });
}

export function verifyState(state: string): boolean {
  pruneExpiredStates();
  const ts = stateMap.get(state);
  if (!ts) return false;
  stateMap.delete(state);
  return Date.now() - ts <= STATE_TTL_MS;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
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
  if (!payload?.sub) throw new Error("Invalid Google token");

  return {
    googleId: payload.sub,
    email: payload.email!,
    firstName: payload.given_name,
    lastName: payload.family_name,
    profileImageUrl: payload.picture,
  };
}
