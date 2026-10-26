import { NextRequest, NextResponse } from "next/server";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { buildGoogleAuthUrl } from "@/modules/auth/lib/google";
import {
  encodeFlowCookie,
  normalizeOrigin,
  renderPopupResult,
  SHOPPER_GOOGLE_COOKIE,
  SHOPPER_GOOGLE_COOKIE_PATH,
  SHOPPER_GOOGLE_MESSAGE_SOURCE,
  SHOPPER_GOOGLE_TTL_SECONDS,
} from "@/lib/shopper-auth/google-popup";

/** Opened in a popup by the widget: sends the shopper to Google. `origin` is the merchant page that
 *  opened it, and the only place the result is ever posted back to. */
export async function GET(req: NextRequest) {
  const origin = normalizeOrigin(req.nextUrl.searchParams.get("origin"));
  const fail = (error: string) =>
    renderPopupResult({ source: SHOPPER_GOOGLE_MESSAGE_SOURCE, ok: false, error }, origin);

  if (!origin) return fail("This sign-in link isn't valid. Close this window and try again.");

  const embedToken = req.nextUrl.searchParams.get("embedToken");
  const resolution = await resolveEmbedRequest(embedToken, { req, kind: "auth" });
  if ("error" in resolution) {
    return fail(resolution.error.status === 429 ? "Too many attempts. Please wait a moment." : "Sign-in isn't available for this store.");
  }

  try {
    const { url, state } = buildGoogleAuthUrl();
    const res = NextResponse.redirect(url);
    res.cookies.set(SHOPPER_GOOGLE_COOKIE, encodeFlowCookie({ state, embedToken: embedToken as string, origin }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: SHOPPER_GOOGLE_COOKIE_PATH,
      maxAge: SHOPPER_GOOGLE_TTL_SECONDS,
    });
    return res;
  } catch (error) {
    const notConfigured = error instanceof Error && error.message.includes("not configured");
    return fail(notConfigured ? "Google sign-in isn't available yet." : "Couldn't start Google sign-in.");
  }
}
