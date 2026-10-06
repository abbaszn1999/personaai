import { NextResponse } from "next/server";
import { buildGoogleAuthUrl, GOOGLE_STATE_COOKIE, GOOGLE_STATE_TTL_SECONDS } from "@/modules/auth/lib/google";

export async function GET() {
  try {
    const { url, state } = buildGoogleAuthUrl();
    const res = NextResponse.redirect(url);
    res.cookies.set(GOOGLE_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth/google",
      maxAge: GOOGLE_STATE_TTL_SECONDS,
    });
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Google OAuth error";
    if (msg.includes("not configured")) {
      return Response.json({ error: "Google OAuth is not configured" }, { status: 503 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}
