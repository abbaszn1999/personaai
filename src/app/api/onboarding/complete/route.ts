import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getSession } from "@/modules/auth/lib/get-user";
import { sessionOptions, type SessionData } from "@/modules/auth/lib/session";
import { completeOnboarding } from "@/lib/db/users";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { role, platform, mainGoal, catalogSize, monthlyTraffic } = body;

    const onboardingData = { role, platform, mainGoal, catalogSize, monthlyTraffic };

    await completeOnboarding(session.userId, onboardingData);

    // Cache onboarding completion in session — skips future proxy DB calls
    const cookieStore = await cookies();
    const ironSession = await getIronSession<SessionData>(cookieStore, sessionOptions);
    ironSession.hasCompletedOnboarding = true;
    await ironSession.save();

    // Workspace creation is intentionally NOT done here — the user connects
    // their store first (/store) then creates their single workspace (/setup).

    return Response.json({ success: true });
  } catch (err) {
    console.error("[onboarding/complete]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
