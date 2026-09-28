import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminSessionOptions, type AdminSessionData } from "./admin-session-options";

export type { AdminSessionData };
export { adminSessionOptions };

export async function getAdminSession() {
  const cookieStore = await cookies();
  return getIronSession<AdminSessionData>(cookieStore, adminSessionOptions);
}

export async function getCurrentAdmin(): Promise<{ email: string } | null> {
  const session = await getAdminSession();
  if (!session.email) return null;
  const expected = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!expected || session.email !== expected) return null;
  return { email: session.email };
}

export async function requireAdmin(): Promise<{ email: string }> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/sign-in");
  return admin;
}
