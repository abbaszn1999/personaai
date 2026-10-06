/**
 * Per-process limits on the merchant auth endpoints, the same in-memory pattern the shopper login
 * uses. They slow down password guessing and email flooding; the hard guarantee against guessing a
 * six-digit code is the per-code check cap in `one-time-code.ts`, which holds across instances.
 */
interface Counter {
  count: number;
  windowStart: number;
}

const buckets = (() => {
  const holder = globalThis as typeof globalThis & { __personaAuthLimits?: Map<string, Counter> };
  holder.__personaAuthLimits ??= new Map();
  return holder.__personaAuthLimits;
})();

const MAX_TRACKED_KEYS = 50_000;

export interface AuthLimit {
  max: number;
  windowMs: number;
}

export const AUTH_LIMITS = {
  loginPerIp: { max: 30, windowMs: 15 * 60_000 },
  loginPerEmail: { max: 10, windowMs: 15 * 60_000 },
  codeCheckPerIp: { max: 30, windowMs: 15 * 60_000 },
  codeSendPerIp: { max: 10, windowMs: 60 * 60_000 },
  codeSendPerEmail: { max: 5, windowMs: 60 * 60_000 },
  registerPerIp: { max: 10, windowMs: 60 * 60_000 },
} satisfies Record<string, AuthLimit>;

/** Counts one attempt against every given key; false when any of them is over its limit. */
export function allowAuthAttempt(...checks: Array<[key: string, limit: AuthLimit]>): boolean {
  const now = Date.now();
  if (buckets.size > MAX_TRACKED_KEYS) {
    for (const [key, counter] of buckets) {
      if (now - counter.windowStart > 60 * 60_000) buckets.delete(key);
    }
  }

  let allowed = true;
  for (const [key, limit] of checks) {
    const existing = buckets.get(key);
    if (!existing || now - existing.windowStart > limit.windowMs) {
      buckets.set(key, { count: 1, windowStart: now });
      continue;
    }
    existing.count += 1;
    if (existing.count > limit.max) allowed = false;
  }
  return allowed;
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export function tooManyAttempts(): Response {
  return Response.json(
    { error: "Too many attempts. Please wait a few minutes and try again." },
    { status: 429 },
  );
}

export const MIN_PASSWORD_LENGTH = 8;

/** Null when acceptable, otherwise the message to show. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 128) return "Password must be 128 characters or fewer.";
  return null;
}
