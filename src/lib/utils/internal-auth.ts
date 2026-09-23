import { createHmac, timingSafeEqual } from "node:crypto";

export const INTERNAL_SECRET_HEADER = "x-internal-secret";

/**
 * Guards routes that are called by the database's scheduler rather than by a signed-in user.
 *
 * Constant-time compare rather than `===`: these routes are publicly routable, so a plain
 * string comparison leaks the secret one byte at a time to anyone willing to measure.
 */
export function isInternalRequest(request: Request): boolean {
  const expected = process.env.INTERNAL_JOB_SECRET;
  if (!expected) {
    console.error("[internal-auth] INTERNAL_JOB_SECRET is not set — internal routes are disabled.");
    return false;
  }

  const provided = request.headers.get(INTERNAL_SECRET_HEADER);
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/**
 * The signing secret for one connection's WooCommerce webhooks.
 *
 * Derived rather than generated and stored. WooCommerce, unlike Shopify, signs with a secret
 * we choose at registration time, and deriving it deterministically means there is no extra
 * column to keep in sync, no secret to lose, and re-registering a webhook after a reconnect
 * produces the same value rather than silently invalidating every delivery already in flight.
 */
export function deriveWebhookSecret(connectionId: string): string {
  const root = process.env.INTERNAL_JOB_SECRET;
  if (!root) throw new Error("INTERNAL_JOB_SECRET is not set — webhook secrets cannot be derived.");
  return createHmac("sha256", root).update(`webhook:${connectionId}`).digest("hex");
}

/**
 * One-way fingerprint of a shopper IP or user agent, keyed per merchant.
 * The raw value is never stored. The same inputs always hash the same way, which is what
 * lets a WooCommerce order be matched to the add-to-cart that came from that device.
 */
export function hashVisitorSignal(ownerId: string, kind: "ip" | "ua", value: string): string {
  const normalized = kind === "ip" ? value.trim().toLowerCase() : value.trim();
  return createHmac("sha256", deriveWebhookSecret(ownerId)).update(`${kind}:${normalized}`).digest("hex");
}

/** Constant-time compare of two base64 HMAC digests. */
export function verifyHmacSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
