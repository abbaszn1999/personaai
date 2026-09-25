import { getCurrentAdmin } from "@/modules/auth/lib/admin-session";
import { writeAuditLog } from "@/lib/db/admin";
import { db } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import { getStripePriceId, isStripeConfigured, purchaseKeyForPlan } from "@/lib/stripe/config";
import type { PlanTierId } from "@/modules/billing/types";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStripeConfigured()) return Response.json({ error: "Stripe is not configured" }, { status: 503 });

  const { id } = await context.params;
  const body = (await req.json()) as { action?: string; tier?: string; days?: number };
  const { data: sub, error } = await db
    .from("billing_subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", id)
    .in("status", ["active", "trialing", "past_due", "incomplete"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !sub?.stripe_subscription_id) {
    return Response.json({ error: "No live subscription" }, { status: 404 });
  }

  const subscriptionId = sub.stripe_subscription_id as string;
  const stripe = getStripe();

  if (body.action === "cancel") {
    await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    await db.from("billing_subscriptions").update({ cancel_at_period_end: true }).eq("stripe_subscription_id", subscriptionId);
    await writeAuditLog({ adminEmail: admin.email, action: "cancel_subscription", targetUserId: id, details: { subscriptionId } });
    return Response.json({ ok: true });
  }

  if (body.action === "extend") {
    const days = Math.floor(Number(body.days));
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      return Response.json({ error: "Days must be between 1 and 90" }, { status: 400 });
    }
    const current = await stripe.subscriptions.retrieve(subscriptionId);
    const periodEnd = Number((current as { current_period_end?: number }).current_period_end ?? 0);
    const base = Math.max(periodEnd, Math.floor(Date.now() / 1000));
    const trialEnd = base + days * 24 * 60 * 60;
    await stripe.subscriptions.update(subscriptionId, { trial_end: trialEnd, proration_behavior: "none" });
    await writeAuditLog({ adminEmail: admin.email, action: "extend_period", targetUserId: id, details: { days, subscriptionId } });
    return Response.json({ ok: true });
  }

  if (body.action === "change_plan") {
    if (body.tier !== "trial" && body.tier !== "main") {
      return Response.json({ error: "Plan must be trial or main" }, { status: 400 });
    }
    const tier = body.tier as PlanTierId;
    const price = getStripePriceId(purchaseKeyForPlan(tier));
    const current = await stripe.subscriptions.retrieve(subscriptionId);
    const item = current.items.data[0];
    if (!item) return Response.json({ error: "Subscription has no price" }, { status: 400 });
    await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: item.id, price }],
      proration_behavior: "none",
    });
    await writeAuditLog({ adminEmail: admin.email, action: "change_plan", targetUserId: id, details: { tier, subscriptionId } });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
