import { randomBytes, randomInt, createHash } from "crypto";

/** Six digits, sent by email — short enough to type on a phone keyboard without a password
 *  manager, long enough (1M possibilities) that the attempt cap in verify-code makes guessing
 *  impractical within the code's 10-minute window. */
export function generateLoginCode(): string {
  return String(randomInt(100000, 999999));
}

/** 256 bits of entropy, sent to the client exactly once and never persisted raw — only its
 *  hash is stored (see hashToken), matching shopper_login_codes' own code_hash column. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/** Plain SHA-256, not bcrypt: both the login code and the session token are already
 *  high-entropy random values (not user-chosen passwords), so a slow KDF buys nothing here —
 *  the real defenses are the attempt cap (codes) and revocation + short user-visible surface
 *  (sessions). This just keeps the raw secret out of the database in case of a read-only leak. */
export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
