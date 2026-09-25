import { getAdminSession } from "@/modules/auth/lib/admin-session";

export async function POST() {
  const session = await getAdminSession();
  session.destroy();
  return Response.json({ ok: true });
}
