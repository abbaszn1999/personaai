import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { adminSessionOptions, type AdminSessionData } from "@/modules/auth/lib/admin-session-options";
import { sessionOptions, type SessionData } from "@/modules/auth/lib/session";

const PUBLIC_PATHS = [
  "/lamp",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/api/auth",
  // The embed token (not a session cookie) is the credential for these — a merchant's
  // shopper never has, and shouldn't need, a Persona AI account.
  "/embed/",
  "/api/embed/",
  // Machine callers with no session to present: pg_cron reaches the catalog jobs via
  // pg_net, and Shopify/WooCommerce post product changes here. Both carry their own
  // credential (a shared secret and an HMAC signature respectively) and verify it
  // themselves, so a session redirect here would silently stall catalog indexing.
  "/api/internal/",
  "/api/webhooks/",
  // Stripe has no session cookie. It signs the raw body, and the route checks that
  // signature itself. A login redirect here makes every delivery a 307.
  "/api/stripe/webhook",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

// First URL segment of every real page. Anything else is a bad link and should
// render the 404 lamp instead of bouncing to sign-in.
const APP_ROOTS = new Set([
  "sign-in",
  "sign-up",
  "forgot-password",
  "onboarding",
  "try-on",
  "branding",
  "preview",
  "setup",
  "usage",
  "analytics",
  "settings",
  "store",
  "admin",
  "embed",
  "api",
  "lamp",
]);

function isUnknownPage(pathname: string): boolean {
  if (pathname === "/") return false;
  const root = pathname.split("/").filter(Boolean)[0];
  return Boolean(root) && !APP_ROOTS.has(root);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const open =
      pathname === "/admin/sign-in" ||
      pathname.startsWith("/api/admin/auth");
    if (open) return NextResponse.next();

    const adminRes = NextResponse.next();
    const adminSession = await getIronSession<AdminSessionData>(req, adminRes, adminSessionOptions);
    if (!adminSession.email) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/admin/sign-in", req.url));
    }
    return adminRes;
  }

  if (isPublicPath(pathname) || isUnknownPage(pathname)) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);

  if (!session.userId) {
    const signIn = new URL("/sign-in", req.url);
    signIn.searchParams.set("from", pathname);
    return NextResponse.redirect(signIn);
  }

  if (!pathname.startsWith("/api/") && pathname !== "/onboarding") {
    // Skip DB call when onboarding status is cached in session
    if (session.hasCompletedOnboarding) {
      return res;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY!;

    const userRes = await fetch(
      `${supabaseUrl}/rest/v1/users?id=eq.${session.userId}&select=has_completed_onboarding`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );

    if (userRes.ok) {
      const [user] = (await userRes.json()) as Array<{ has_completed_onboarding: boolean }>;
      if (user?.has_completed_onboarding) {
        session.hasCompletedOnboarding = true;
        await session.save();
        return res;
      }
      if (user && !user.has_completed_onboarding) {
        return NextResponse.redirect(new URL("/onboarding", req.url));
      }
    }
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
