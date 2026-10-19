import { getCurrentAdmin } from "@/modules/auth/lib/admin-session";
import { writeAuditLog } from "@/lib/db/admin";
import { db } from "@/lib/supabase/server";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = (await req.json().catch(() => ({}))) as { show?: unknown };
  if (typeof body.show !== "boolean") {
    return Response.json({ error: "show must be true or false" }, { status: 400 });
  }

  const { data, error } = await db
    .from("users")
    .update({ show_usage_costs: body.show })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[api/admin/merchants/usage-costs POST]", error);
    return Response.json({ error: "Could not save" }, { status: 500 });
  }
  if (!data) return Response.json({ error: "Merchant not found" }, { status: 404 });

  await writeAuditLog({
    adminEmail: admin.email,
    action: "set_usage_costs",
    targetUserId: id,
    details: { show: body.show },
  });
  return Response.json({ ok: true, show: body.show });
}
