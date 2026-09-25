import { getCurrentAdmin } from "@/modules/auth/lib/admin-session";
import { grantWallet, writeAuditLog } from "@/lib/db/admin";

const WALLETS = new Set(["garments", "live", "sessions"]);

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = (await req.json()) as { wallet?: string; amount?: number };
  const amount = Math.floor(Number(body.amount));
  if (!body.wallet || !WALLETS.has(body.wallet) || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    return Response.json({ error: "Amount must be between 1 and 1,000,000" }, { status: 400 });
  }

  const wallet = body.wallet as "garments" | "live" | "sessions";
  const balance = await grantWallet({ userId: id, wallet, amount });
  if (balance === null) return Response.json({ error: "Could not grant balance" }, { status: 500 });

  await writeAuditLog({
    adminEmail: admin.email,
    action: "grant_credits",
    targetUserId: id,
    details: { wallet, amount, balance },
  });
  return Response.json({ ok: true, balance });
}
