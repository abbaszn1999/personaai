import { db } from "@/lib/supabase/server";

export interface ShopperAccountRow {
  id: string;
  workspaceId: string;
  email: string;
  emailVerifiedAt: string | null;
  privacyAcceptedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

function rowToAccount(row: Record<string, unknown>): ShopperAccountRow {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    email: row.email as string,
    emailVerifiedAt: (row.email_verified_at as string | null) ?? null,
    privacyAcceptedAt: (row.privacy_accepted_at as string | null) ?? null,
    lastSeenAt: (row.last_seen_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function getShopperAccountByEmail(
  workspaceId: string,
  email: string
): Promise<ShopperAccountRow | null> {
  const { data, error } = await db
    .from("shopper_accounts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error || !data) return null;
  return rowToAccount(data);
}

export async function getShopperAccountById(id: string): Promise<ShopperAccountRow | null> {
  const { data, error } = await db.from("shopper_accounts").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return rowToAccount(data);
}

/** Creates the account on first successful code verification, or just touches it on every
 *  later one — `privacyAccepted` is only meaningful (and required by the caller) the first
 *  time, since re-verifying an existing account doesn't re-ask for consent. */
export async function upsertShopperAccount(
  workspaceId: string,
  email: string,
  privacyAccepted: boolean
): Promise<ShopperAccountRow | null> {
  const normalizedEmail = email.toLowerCase();
  const now = new Date().toISOString();

  const existing = await getShopperAccountByEmail(workspaceId, normalizedEmail);
  if (existing) {
    const { data, error } = await db
      .from("shopper_accounts")
      .update({ email_verified_at: existing.emailVerifiedAt ?? now, last_seen_at: now, updated_at: now })
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();
    if (error || !data) return null;
    return rowToAccount(data);
  }

  const { data, error } = await db
    .from("shopper_accounts")
    .insert({
      workspace_id: workspaceId,
      email: normalizedEmail,
      email_verified_at: now,
      privacy_accepted_at: privacyAccepted ? now : null,
      last_seen_at: now,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    console.error("[db/shopper-accounts upsertShopperAccount]", error);
    return null;
  }
  return rowToAccount(data);
}

export async function touchShopperAccountLastSeen(id: string): Promise<void> {
  const { error } = await db
    .from("shopper_accounts")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error("[db/shopper-accounts touchShopperAccountLastSeen]", error);
}

// ─── Login codes ───────────────────────────────────────────────────────────

export interface ShopperLoginCodeRow {
  id: string;
  workspaceId: string;
  email: string;
  codeHash: string;
  attempts: number;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

function rowToLoginCode(row: Record<string, unknown>): ShopperLoginCodeRow {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    email: row.email as string,
    codeHash: row.code_hash as string,
    attempts: row.attempts as number,
    expiresAt: row.expires_at as string,
    consumedAt: (row.consumed_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function createShopperLoginCode(input: {
  workspaceId: string;
  email: string;
  codeHash: string;
  expiresAt: string;
}): Promise<void> {
  const { error } = await db.from("shopper_login_codes").insert({
    workspace_id: input.workspaceId,
    email: input.email.toLowerCase(),
    code_hash: input.codeHash,
    expires_at: input.expiresAt,
  });
  if (error) console.error("[db/shopper-accounts createShopperLoginCode]", error);
}

/** Most recent still-usable code for this (workspace, email) — used both to enforce a resend
 *  cooldown and to verify whatever the shopper just typed in. */
export async function getLatestShopperLoginCode(
  workspaceId: string,
  email: string
): Promise<ShopperLoginCodeRow | null> {
  const { data, error } = await db
    .from("shopper_login_codes")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("email", email.toLowerCase())
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return rowToLoginCode(data);
}

/** Not atomic — a lost increment under two truly concurrent guesses only ever makes
 *  brute-forcing marginally easier, and the code still expires in 10 minutes regardless, so a
 *  read-then-write is an acceptable tradeoff against the complexity of a dedicated RPC. */
export async function incrementShopperLoginCodeAttempts(id: string, currentAttempts: number): Promise<void> {
  const { error } = await db
    .from("shopper_login_codes")
    .update({ attempts: currentAttempts + 1 })
    .eq("id", id);
  if (error) console.error("[db/shopper-accounts incrementShopperLoginCodeAttempts]", error);
}

export async function consumeShopperLoginCode(id: string): Promise<void> {
  const { error } = await db
    .from("shopper_login_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error("[db/shopper-accounts consumeShopperLoginCode]", error);
}

// ─── Sessions ──────────────────────────────────────────────────────────────

export interface ShopperSessionRow {
  id: string;
  shopperAccountId: string;
  expiresAt: string;
  revokedAt: string | null;
  account: ShopperAccountRow;
}

export async function createShopperSession(input: {
  shopperAccountId: string;
  tokenHash: string;
  userAgent: string | null;
  expiresAt: string;
}): Promise<void> {
  const { error } = await db.from("shopper_sessions").insert({
    shopper_account_id: input.shopperAccountId,
    token_hash: input.tokenHash,
    user_agent: input.userAgent,
    expires_at: input.expiresAt,
  });
  if (error) console.error("[db/shopper-accounts createShopperSession]", error);
}

/** Two plain queries rather than one embedded-relation select — Supabase's JS types the
 *  embedded resource as an array unless a foreign-key hint/generated schema types disambiguate
 *  it, which this codebase doesn't have set up (see the rest of src/lib/db for the same
 *  hand-cast-row pattern). Session lookups are rare enough (once per widget cold start) that
 *  the extra round trip is a non-issue. */
export async function getShopperSessionByTokenHash(tokenHash: string): Promise<ShopperSessionRow | null> {
  const { data, error } = await db
    .from("shopper_sessions")
    .select("id, shopper_account_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) return null;

  const account = await getShopperAccountById(data.shopper_account_id as string);
  if (!account) return null;

  return {
    id: data.id as string,
    shopperAccountId: data.shopper_account_id as string,
    expiresAt: data.expires_at as string,
    revokedAt: (data.revoked_at as string | null) ?? null,
    account,
  };
}

export async function revokeShopperSessionByTokenHash(tokenHash: string): Promise<void> {
  const { error } = await db
    .from("shopper_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", tokenHash);
  if (error) console.error("[db/shopper-accounts revokeShopperSessionByTokenHash]", error);
}
