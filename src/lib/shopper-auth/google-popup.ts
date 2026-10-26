/**
 * "Continue with Google" for shoppers, run in a popup on this app's own domain.
 *
 * The widget sits directly in the merchant's page, so it cannot take a redirect from Google itself.
 * It opens a popup at `/api/embed/shopper/google/start`, which sends the shopper to Google. Google
 * returns to the same redirect URI the merchant dashboard sign-in already uses (so nothing new has to
 * be registered with Google); that route recognises a shopper flow by its own cookie and hands the
 * request to `handleShopperGoogleCallback`.
 *
 * What comes back to the widget is a one-time ticket stored exactly like an emailed login code (hashed,
 * ten minutes, attempt-capped), so the widget redeems it through the existing verify-code route and the
 * privacy notice for a first-time shopper works the same as it does for an email sign-in.
 */
import type { NextRequest } from "next/server";
import { isGuestEmail } from "./guest";
import { generateSessionToken, hashToken } from "./tokens";

export const SHOPPER_GOOGLE_COOKIE = "persona-shopper-oauth";
export const SHOPPER_GOOGLE_COOKIE_PATH = "/api/auth/google";
export const SHOPPER_GOOGLE_TTL_SECONDS = 10 * 60;
/** The `source` the widget looks for on the message that comes back from the popup. */
export const SHOPPER_GOOGLE_MESSAGE_SOURCE = "autoshopping-shopper-google";

const TICKET_TTL_MS = 10 * 60 * 1000;

export type GooglePopupResult =
  | { source: typeof SHOPPER_GOOGLE_MESSAGE_SOURCE; ok: true; email: string; ticket: string }
  | { source: typeof SHOPPER_GOOGLE_MESSAGE_SOURCE; ok: false; error: string; cancelled?: boolean };

interface FlowCookie {
  state: string;
  embedToken: string;
  /** The merchant page that opened the popup: the only place the result is posted to. */
  origin: string;
}

export function encodeFlowCookie(value: FlowCookie): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeFlowCookie(raw: string | undefined): FlowCookie | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<FlowCookie>;
    if (typeof parsed.state === "string" && typeof parsed.embedToken === "string" && typeof parsed.origin === "string") {
      return { state: parsed.state, embedToken: parsed.embedToken, origin: parsed.origin };
    }
  } catch {
    // Falls through: treated as no flow in progress.
  }
  return null;
}

/** Only a plain http(s) origin can be a postMessage target; anything else is refused. */
export function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** JSON that is safe to place inside an inline `<script>`: no `</script>`, no line separators. */
function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/**
 * The popup's last page: tells the widget that opened it how it went, then closes itself. With no
 * known origin (an expired or foreign flow) nothing is posted, since there is nobody safe to tell.
 */
export function renderPopupResult(result: GooglePopupResult, targetOrigin: string | null): Response {
  const message = result.ok
    ? "You're signed in. You can close this window."
    : result.cancelled
      ? "Sign-in cancelled. You can close this window."
      : result.error;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Signing in</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center;color:#17121d;background:#faf9fb}p{max-width:20rem;line-height:1.5;font-size:15px}</style>
</head><body><p id="m"></p>
<script>
(function(){
  var payload=${scriptSafeJson(result)};
  var origin=${scriptSafeJson(targetOrigin)};
  var text=${scriptSafeJson(message)};
  document.getElementById("m").textContent=text;
  try{
    if(origin&&window.opener){
      window.opener.postMessage(payload,origin);
      setTimeout(function(){window.close()},350);
    }
  }catch(e){}
})();
</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function failure(error: string, origin: string | null, cancelled = false): Response {
  const response = renderPopupResult({ source: SHOPPER_GOOGLE_MESSAGE_SOURCE, ok: false, error, cancelled }, origin);
  // The flow is over whatever happened: the cookie is single use.
  response.headers.append(
    "Set-Cookie",
    `${SHOPPER_GOOGLE_COOKIE}=; Path=${SHOPPER_GOOGLE_COOKIE_PATH}; Max-Age=0; HttpOnly; SameSite=Lax`
  );
  return response;
}

/** True when this callback belongs to a shopper popup flow rather than the dashboard sign-in. */
export function isShopperGoogleFlow(req: NextRequest): boolean {
  return req.cookies.has(SHOPPER_GOOGLE_COOKIE);
}

/** The return leg: verifies the flow, reads the Google account, files the one-time ticket. */
export async function handleShopperGoogleCallback(req: NextRequest): Promise<Response> {
  const flow = decodeFlowCookie(req.cookies.get(SHOPPER_GOOGLE_COOKIE)?.value);
  if (!flow) return failure("This sign-in link has expired. Close this window and try again.", null);
  const origin = normalizeOrigin(flow.origin);
  if (!origin) return failure("This sign-in link has expired. Close this window and try again.", null);

  try {
    // Loaded here so the pure helpers above can be used (and tested) without a database.
    const [{ getWorkspaceByEmbedToken }, { createShopperLoginCode }, { exchangeCodeForProfile, verifyState }] =
      await Promise.all([
        import("@/lib/db/workspaces"),
        import("@/lib/db/shopper-accounts"),
        import("@/modules/auth/lib/google"),
      ]);

    const { searchParams } = new URL(req.url);
    if (searchParams.get("error")) return failure("Sign-in cancelled.", origin, true);

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code || !state) return failure("Google sign-in didn't complete. Please try again.", origin);
    if (!verifyState(state, flow.state)) return failure("Google sign-in couldn't be verified. Please try again.", origin);

    const workspace = await getWorkspaceByEmbedToken(flow.embedToken);
    if (!workspace || !workspace.embedEnabled) return failure("Sign-in isn't available for this store right now.", origin);

    const profile = await exchangeCodeForProfile(code);
    // Only an address Google itself has verified proves the person owns the inbox.
    if (!profile.emailVerified) return failure("That Google account's email isn't verified.", origin);

    const email = profile.email.trim().toLowerCase();
    if (isGuestEmail(email)) return failure("Google sign-in didn't work for that account.", origin);

    const ticket = generateSessionToken();
    await createShopperLoginCode({
      workspaceId: workspace.workspaceId,
      email,
      codeHash: hashToken(ticket),
      expiresAt: new Date(Date.now() + TICKET_TTL_MS).toISOString(),
    });

    const response = renderPopupResult({ source: SHOPPER_GOOGLE_MESSAGE_SOURCE, ok: true, email, ticket }, origin);
    response.headers.append(
      "Set-Cookie",
      `${SHOPPER_GOOGLE_COOKIE}=; Path=${SHOPPER_GOOGLE_COOKIE_PATH}; Max-Age=0; HttpOnly; SameSite=Lax`
    );
    return response;
  } catch (error) {
    console.error("[shopper google callback]", error);
    return failure("Google sign-in failed. Please try again.", origin);
  }
}
