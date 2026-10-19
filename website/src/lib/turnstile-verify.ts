/**
 * Cloudflare Turnstile, server side. Used by the site's own /api/contact route.
 * The secret comes from TURNSTILE_SECRET_KEY and must never be sent to the browser.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * - `skipped`: no secret is configured (local development), nothing was checked.
 * - `failed`: Cloudflare says the token is missing, invalid, used already or expired.
 * - `unavailable`: Cloudflare could not be reached, so the visitor could not be checked.
 */
export type VerifyOutcome = "ok" | "skipped" | "failed" | "unavailable";

export async function verifyTurnstile(
  token: unknown,
  ip?: string,
  options: { secret?: string; fetchImpl?: typeof fetch } = {},
): Promise<VerifyOutcome> {
  const secret = options.secret ?? process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return "skipped";
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return "failed";

  const form = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") form.set("remoteip", ip);

  try {
    const res = await (options.fetchImpl ?? fetch)(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    if (!res.ok) return "unavailable";
    const body = (await res.json()) as { success?: boolean };
    return body.success === true ? "ok" : "failed";
  } catch {
    return "unavailable";
  }
}
