import { getCurrentAdmin } from "@/modules/auth/lib/admin-session";
import { getSession } from "@/modules/auth/lib/get-user";
import { writeAuditLog } from "@/lib/db/admin";
import { deleteSessionBySid } from "@/lib/db/sessions";

export async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const session = await getSession();
  const userId = session.userId;
  if (session.sid) await deleteSessionBySid(session.sid);
  session.destroy();

  await writeAuditLog({
    adminEmail: admin.email,
    action: "impersonate_exit",
    targetUserId: userId || null,
  });

  return Response.json({ redirect: "/admin" });
}
