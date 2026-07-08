import type { SessionOptions } from "iron-session";

/** Lightweight profile snapshot cached in the cookie so the layout never queries the DB. */
export interface SessionProfile {
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  provider: string;
  googleId: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
  subscriptionTier: string;
  credits: number;
  workspaceLimit: number;
  onboardingData: Record<string, unknown> | null;
}

export interface SessionData {
  userId: string;
  sid: string;
  /** Cached after first DB check — skips proxy onboarding query when true */
  hasCompletedOnboarding?: boolean;
  /** User profile cached in cookie — layout reads this instead of hitting DB */
  profile?: SessionProfile;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "persona-ai.sid",
  ttl: 60 * 60 * 24 * 7, // 7 days
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  },
};
