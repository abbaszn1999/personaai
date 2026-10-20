/**
 * Live try-on grants: what the app hands the browser instead of a Decart credential when live
 * try-on runs through the signaling proxy (scripts/decart-live-proxy.mjs).
 *
 * A grant is `<base64url JSON>.<base64url HMAC-SHA256>` signed with LIVE_PROXY_SECRET. It names
 * the merchant to bill and caps the session; only the proxy can turn it into a Decart session.
 * Two dot-separated parts on purpose: the Decart SDK only inspects three-part JWTs, so it passes
 * a grant through to the proxy untouched.
 *
 * Shared by the Next app (signing, usage verification) and the proxy (verification), so both
 * sides always agree on the format.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const SOURCES = new Set(["store", "preview"]);
export const LIVE_GRANT_MIN_SECONDS = 10;
export const LIVE_GRANT_MAX_SECONDS = 90;

function mac(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function signLiveGrant(payload, secret) {
  if (!secret) throw new Error("LIVE_PROXY_SECRET is not configured");
  const body = Buffer.from(JSON.stringify({ v: 1, ...payload })).toString("base64url");
  return `${body}.${mac(`grant:${body}`, secret)}`;
}

/** Returns the payload when the signature and shape are valid, else null. */
export function verifyLiveGrant(grant, secret, options = {}) {
  if (!secret || typeof grant !== "string" || grant.length > 2048) return null;
  const parts = grant.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!safeEqual(signature, mac(`grant:${body}`, secret))) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || payload.v !== 1) return null;
  if (typeof payload.ownerId !== "string" || !payload.ownerId) return null;
  if (!SOURCES.has(payload.source)) return null;
  if (typeof payload.sessionId !== "string" || !payload.sessionId || payload.sessionId.length > 200) return null;
  if (typeof payload.grantId !== "string" || payload.grantId.length < 8) return null;
  if (
    !Number.isInteger(payload.maxSeconds) ||
    payload.maxSeconds < LIVE_GRANT_MIN_SECONDS ||
    payload.maxSeconds > LIVE_GRANT_MAX_SECONDS
  ) {
    return null;
  }
  if (!Number.isInteger(payload.exp)) return null;
  if (!options.ignoreExpiry && payload.exp * 1000 < (options.now ?? Date.now())) return null;
  return payload;
}

/** Signature of a proxy → app usage report body. */
export function signUsageReport(rawBody, secret) {
  return mac(`usage:${rawBody}`, secret);
}

export function verifyUsageReport(rawBody, signature, secret) {
  if (!secret || typeof signature !== "string") return false;
  return safeEqual(signature, mac(`usage:${rawBody}`, secret));
}
