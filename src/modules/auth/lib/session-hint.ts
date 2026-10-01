import type { NextResponse } from "next/server";
import { sessionOptions } from "./session";

/**
 * Non-secret "is signed in" flag the marketing site reads before paint to swap
 * Sign in / Start trial for Dashboard. It carries no identity; the sealed session
 * cookie stays the only credential.
 *
 * In production the marketing site and the app must share a parent domain
 * (e.g. personaai.com + app.personaai.com) and SESSION_HINT_COOKIE_DOMAIN must be
 * set to it (".personaai.com"). On localhost cookies ignore the port, so no domain is needed.
 */
export const SESSION_HINT_COOKIE = "persona_signed_in";

export function applySessionHint(res: NextResponse, signedIn: boolean) {
  const domain = process.env.SESSION_HINT_COOKIE_DOMAIN || undefined;
  res.cookies.set(SESSION_HINT_COOKIE, signedIn ? "1" : "", {
    domain,
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: signedIn ? sessionOptions.ttl : 0,
  });
}
