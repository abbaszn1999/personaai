import { getCurrentAdmin } from "@/modules/auth/lib/admin-session";
import { deleteMerchant, writeAuditLog } from "@/lib/db/admin";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const deleted = await deleteMerchant(id);
  if (!deleted) return Response.json({ error: "Could not delete merchant" }, { status: 500 });

  await writeAuditLog({ adminEmail: admin.email, action: "delete_merchant", targetUserId: id });
  return Response.json({ redirect: "/admin/merchants" });
}
