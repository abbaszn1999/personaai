import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/modules/auth/lib/session";

const PUBLIC_PATHS = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/api/auth",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
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

  if (isPublicPath(pathname)) {
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
