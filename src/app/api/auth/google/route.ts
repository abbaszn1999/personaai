import { buildGoogleAuthUrl } from "@/modules/auth/lib/google";

export async function GET() {
  try {
    const url = buildGoogleAuthUrl();
    return Response.redirect(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Google OAuth error";
    if (msg.includes("not configured")) {
      return Response.json({ error: "Google OAuth is not configured" }, { status: 503 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}
