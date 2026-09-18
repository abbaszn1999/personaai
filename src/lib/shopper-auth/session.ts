import {
  createShopperSession,
  getShopperSessionByTokenHash,
  revokeShopperSessionByTokenHash,
  type ShopperAccountRow,
} from "@/lib/db/shopper-accounts";
import { generateSessionToken, hashToken } from "./tokens";

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days — long-lived on purpose, since the
// whole point is a shopper never has to re-verify their email on a device/app they already
// used before. Re-verification only happens again after this window or an explicit logout.

/** Issues a new session and returns the raw token — the only time it ever exists outside the
 *  client's own storage; the database only ever sees/keeps its hash. */
export async function issueShopperSession(
  shopperAccountId: string,
  userAgent: string | null
): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await createShopperSession({
    shopperAccountId,
    tokenHash: hashToken(token),
    userAgent,
    expiresAt,
  });
  return token;
}

export interface ResolvedShopperSession {
  sessionId: string;
  account: ShopperAccountRow;
}

/** Validates an `Authorization: Bearer <token>` value — checks the hash exists, isn't
 *  expired, and hasn't been revoked (logout). Returns null for anything short of a fully
 *  valid, live session rather than distinguishing *why* it failed, since every caller's
 *  correct response is the same: treat the shopper as signed out. */
export async function resolveShopperSession(token: string | null): Promise<ResolvedShopperSession | null> {
  if (!token) return null;

  const session = await getShopperSessionByTokenHash(hashToken(token));
  if (!session) return null;
  if (session.revokedAt) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) return null;

  return { sessionId: session.id, account: session.account };
}

export async function revokeShopperSession(token: string): Promise<void> {
  await revokeShopperSessionByTokenHash(hashToken(token));
}

/** Pulls the bearer token out of a standard `Authorization: Bearer <token>` header — used by
 *  every authenticated `/api/embed/shopper/*` route instead of duplicating the parsing. */
export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}
