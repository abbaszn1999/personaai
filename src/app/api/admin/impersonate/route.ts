import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getCurrentAdmin } from "@/modules/auth/lib/admin-session";
import { buildSessionProfile } from "@/modules/auth/lib/get-user";
import { sessionOptions, type SessionData } from "@/modules/auth/lib/session";
import { writeAuditLog } from "@/lib/db/admin";
import { createSession } from "@/lib/db/sessions";
import { getUserById } from "@/lib/db/users";

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = (await req.json()) as { userId?: string };
  if (!userId) return Response.json({ error: "Merchant is required" }, { status: 400 });

  const user = await getUserById(userId);
  if (!user) return Response.json({ error: "Merchant not found" }, { status: 404 });

  const sid = randomUUID();
  const expire = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await createSession(user.id, sid, expire);

  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  session.userId = user.id;
  session.sid = sid;
  session.hasCompletedOnboarding = user.has_completed_onboarding;
  session.profile = buildSessionProfile(user);
  session.impersonatedBy = admin.email;
  await session.save();

  await writeAuditLog({
    adminEmail: admin.email,
    action: "impersonate_start",
    targetUserId: user.id,
    details: { email: user.email },
  });

  return Response.json({ redirect: "/" });
}
