import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type SessionData, type SessionProfile } from "./session";
import { getUserById, type UserRow } from "@/lib/db/users";

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  provider: string;
  googleId: string | null;
  emailVerified: boolean;
  hasCompletedOnboarding: boolean;
  onboardingData: Record<string, unknown> | null;
  credits: number;
  subscriptionTier: string;
  workspaceLimit: number;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Build a SessionProfile from a DB row — call once at login/register then cache. */
export function buildSessionProfile(row: Partial<UserRow>): SessionProfile {
  return {
    email: row.email as string,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    profileImageUrl: row.profile_image_url ?? null,
    provider: row.provider as string,
    googleId: row.google_id ?? null,
    emailVerified: row.email_verified as boolean,
    hasPassword: !!row.password_hash,
    subscriptionTier: row.subscription_tier ?? "free",
    credits: row.credits ?? 0,
    workspaceLimit: row.workspace_limit ?? 3,
    onboardingData: row.onboarding_data ?? null,
  };
}

/**
 * Returns the current user. Reads from the session cookie profile cache first —
 * only falls back to a DB query if the cache is missing (e.g. old sessions).
 */
export async function getCurrentUser(): Promise<UserProfile | null> {
  const session = await getSession();
  if (!session.userId) return null;

  // --- Fast path: profile is cached in the cookie, zero DB calls ---
  if (session.profile) {
    return {
      id: session.userId,
      ...session.profile,
      hasCompletedOnboarding: session.hasCompletedOnboarding ?? false,
      // These fields aren't in the cache but aren't needed for rendering
      createdAt: "",
      updatedAt: "",
    };
  }

  // --- Cold path: pre-cache session (e.g. existing login before this change) ---
  // Cookie writes are not allowed from Server Components, so we can't cache here.
  // New sessions (from login/OAuth/verify-email) will always have session.profile set.
  const data = await getUserById(session.userId);
  if (!data) return null;

  return {
    id: data.id,
    email: data.email,
    firstName: data.first_name,
    lastName: data.last_name,
    profileImageUrl: data.profile_image_url,
    provider: data.provider,
    googleId: data.google_id,
    emailVerified: data.email_verified,
    hasCompletedOnboarding: data.has_completed_onboarding,
    onboardingData: data.onboarding_data,
    credits: data.credits,
    subscriptionTier: data.subscription_tier,
    workspaceLimit: data.workspace_limit,
    hasPassword: !!data.password_hash,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}
