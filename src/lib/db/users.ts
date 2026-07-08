import { db } from "@/lib/supabase/server";

/** Raw DB row shape for the `users` table (snake_case, as stored). */
export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  first_name: string | null;
  last_name: string | null;
  profile_image_url: string | null;
  provider: string;
  google_id: string | null;
  email_verified: boolean;
  email_verification_token: string | null;
  email_verification_expiry: string | null;
  password_reset_token: string | null;
  password_reset_expiry: string | null;
  has_completed_onboarding: boolean;
  onboarding_data: Record<string, unknown> | null;
  notification_preferences: Record<string, unknown> | null;
  openai_api_key_encrypted: string | null;
  credits: number;
  subscription_tier: string;
  workspace_limit: number;
  created_at: string;
  updated_at: string;
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const { data, error } = await db.from("users").select("*").eq("id", id).single();
  if (error || !data) return null;
  return data as UserRow;
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("email", email.toLowerCase())
    .single();
  if (error || !data) return null;
  return data as UserRow;
}

export async function emailExists(email: string): Promise<boolean> {
  const { data } = await db
    .from("users")
    .select("id")
    .eq("email", email.toLowerCase())
    .single();
  return !!data;
}

export async function getPasswordHash(id: string): Promise<string | null> {
  const { data } = await db.from("users").select("password_hash").eq("id", id).single();
  return data?.password_hash ?? null;
}

export interface CreateCredentialsUserInput {
  email: string;
  passwordHash: string;
  firstName?: string | null;
  lastName?: string | null;
  verificationToken: string;
  verificationExpiry: string;
}

/** Returns the subset of columns needed right after registration. */
export async function createCredentialsUser(input: CreateCredentialsUserInput) {
  const { data, error } = await db
    .from("users")
    .insert({
      email: input.email.toLowerCase(),
      password_hash: input.passwordHash,
      first_name: input.firstName ?? null,
      last_name: input.lastName ?? null,
      provider: "credentials",
      email_verified: false,
      email_verification_token: input.verificationToken,
      email_verification_expiry: input.verificationExpiry,
    })
    .select("id, email, first_name, last_name, provider, email_verified, has_completed_onboarding, created_at")
    .single();

  if (error || !data) {
    console.error("[db/users createCredentialsUser]", error);
    return null;
  }

  return data;
}

export interface CreateGoogleUserInput {
  email: string;
  googleId: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

export async function createGoogleUser(input: CreateGoogleUserInput): Promise<UserRow | null> {
  const { data, error } = await db
    .from("users")
    .insert({
      email: input.email.toLowerCase(),
      provider: "google",
      google_id: input.googleId,
      first_name: input.firstName,
      last_name: input.lastName,
      profile_image_url: input.profileImageUrl,
      email_verified: true,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[db/users createGoogleUser]", error);
    return null;
  }

  return data as UserRow;
}

export interface LinkGoogleAccountInput {
  googleId: string;
  profileImageUrl?: string | null;
}

export async function linkGoogleAccount(id: string, input: LinkGoogleAccountInput): Promise<void> {
  const patch: Record<string, unknown> = {
    google_id: input.googleId,
    email_verified: true,
    updated_at: new Date().toISOString(),
  };
  if (input.profileImageUrl !== undefined) patch.profile_image_url = input.profileImageUrl;

  await db.from("users").update(patch).eq("id", id);
}

export async function setEmailVerificationCode(id: string, token: string, expiry: string): Promise<void> {
  await db
    .from("users")
    .update({ email_verification_token: token, email_verification_expiry: expiry })
    .eq("id", id);
}

export async function markEmailVerified(id: string): Promise<void> {
  await db
    .from("users")
    .update({
      email_verified: true,
      email_verification_token: null,
      email_verification_expiry: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function setPasswordResetCode(id: string, token: string, expiry: string): Promise<void> {
  await db
    .from("users")
    .update({ password_reset_token: token, password_reset_expiry: expiry, updated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function resetPassword(id: string, passwordHash: string): Promise<void> {
  await db
    .from("users")
    .update({
      password_hash: passwordHash,
      password_reset_token: null,
      password_reset_expiry: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function setPassword(id: string, passwordHash: string): Promise<void> {
  await db
    .from("users")
    .update({ password_hash: passwordHash, provider: "credentials", updated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function changePassword(id: string, passwordHash: string): Promise<void> {
  await db
    .from("users")
    .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
    .eq("id", id);
}

export interface UpdateProfileInput {
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string;
}

export async function updateProfile(id: string, input: UpdateProfileInput) {
  const patch: Record<string, unknown> = {
    first_name: input.firstName ?? null,
    last_name: input.lastName ?? null,
    updated_at: new Date().toISOString(),
  };
  if (input.profileImageUrl !== undefined) {
    patch.profile_image_url = input.profileImageUrl || null;
  }

  const { data, error } = await db
    .from("users")
    .update(patch)
    .eq("id", id)
    .select("id, email, first_name, last_name, profile_image_url, provider, updated_at")
    .single();

  if (error) {
    console.error("[db/users updateProfile]", error);
    return null;
  }

  return data;
}

export async function completeOnboarding(id: string, onboardingData: Record<string, unknown>): Promise<void> {
  await db
    .from("users")
    .update({
      has_completed_onboarding: true,
      onboarding_data: onboardingData,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function deleteUser(id: string): Promise<void> {
  await db.from("users").delete().eq("id", id);
}

/** Stores the (already-encrypted) OpenAI API key ciphertext, or clears it when `null`. */
export async function setOpenaiApiKey(id: string, encryptedKey: string | null): Promise<boolean> {
  const { error } = await db
    .from("users")
    .update({ openai_api_key_encrypted: encryptedKey, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("[db/users setOpenaiApiKey]", error);
    return false;
  }
  return true;
}

export async function getOpenaiApiKeyEncrypted(id: string): Promise<string | null> {
  const { data, error } = await db
    .from("users")
    .select("openai_api_key_encrypted")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data.openai_api_key_encrypted ?? null;
}
