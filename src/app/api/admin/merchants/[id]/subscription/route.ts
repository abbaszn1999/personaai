import { getCurrentAdmin } from "@/modules/auth/lib/admin-session";
import { writeAuditLog } from "@/lib/db/admin";
import {
  getLiveTrialSubscription,
  getOrCreateBillingAccount,
  hasLiveSubscription,
  setStripeCustomerId,
  upsertBillingSubscription,
} from "@/lib/db/billing";
import { getUserById } from "@/lib/db/users";
import { db } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import { getStripePriceId, isStripeConfigured, purchaseKeyForPlan } from "@/lib/stripe/config";
import { COMPED_METADATA_KEY, settleTrialOnUpgrade } from "@/lib/billing/settle-trial";
import type { PlanTierId } from "@/modules/billing/types";

const COMPED_DAYS = 30;

function isoFromUnix(seconds: number | null | undefined): string | null {
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString();
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

type CreateResult = { subscriptionId: string } | { error: string; status: number };

/**
 * Starts a subscription with no charge today: the first COMPED_DAYS are free. Trial ends on its own;
 * Main renews at the end and Stripe bills the saved card then.
 */
async function createCompedSubscription(
  userId: string,
  tier: PlanTierId,
  idempotencyKey: string
): Promise<CreateResult> {
  const user = await getUserById(userId);
  if (!user) return { error: "Account not found", status: 404 };

  const account = await getOrCreateBillingAccount(userId);
  if (!account) return { error: "Unable to initialize billing", status: 500 };
  let customerId = account.stripeCustomerId;
  if (!customerId) {
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || undefined;
    const customer = await getStripe().customers.create(
      { email: user.email, name, metadata: { autommerce_user_id: userId } },
      { idempotencyKey: `autommerce-customer-${userId}` }
    );
    if (!(await setStripeCustomerId(userId, customer.id))) {
      return { error: "Unable to save Stripe customer", status: 500 };
    }
    customerId = customer.id;
  }

  const price = getStripePriceId(purchaseKeyForPlan(tier));
  const created = await getStripe().subscriptions.create(
    {
      customer: customerId,
      items: [{ price }],
      trial_period_days: COMPED_DAYS,
      cancel_at_period_end: tier === "trial",
      proration_behavior: "none",
      metadata: { autommerce_user_id: userId, [COMPED_METADATA_KEY]: "true" },
    },
    { idempotencyKey }
  );
  const item = created.items.data[0];
  const period = created as unknown as { current_period_start?: number; current_period_end?: number };
  const itemPeriod = item as unknown as { current_period_start?: number; current_period_end?: number };
  const saved = await upsertBillingSubscription({
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: created.id,
    stripeProductId: typeof item?.price.product === "string" ? item.price.product : item?.price.product?.id ?? "",
    stripePriceId: item?.price.id ?? price,
    tierId: tier,
    status: created.status,
    currentPeriodStart: isoFromUnix(period.current_period_start ?? itemPeriod.current_period_start),
    currentPeriodEnd: isoFromUnix(period.current_period_end ?? itemPeriod.current_period_end),
    cancelAtPeriodEnd: created.cancel_at_period_end,
    canceledAt: isoFromUnix(created.canceled_at),
    stripeEventCreatedAt: new Date().toISOString(),
  });
  if (!saved) return { error: "Subscription was created but could not be saved", status: 500 };
  return { subscriptionId: created.id };
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStripeConfigured()) return Response.json({ error: "Stripe is not configured" }, { status: 503 });

  const { id } = await context.params;
  const body = (await req.json()) as { action?: string; tier?: string; days?: number };

  if (body.action === "grant_plan") {
    if (body.tier !== "trial" && body.tier !== "main") {
      return Response.json({ error: "Plan must be trial or main" }, { status: 400 });
    }
    if (await hasLiveSubscription(id)) {
      return Response.json({ error: "This account already has a subscription" }, { status: 409 });
    }
    const tier = body.tier as PlanTierId;
    const result = await createCompedSubscription(id, tier, `autommerce-admin-grant-${id}-${tier}-${todayKey()}`);
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    await writeAuditLog({
      adminEmail: admin.email,
      action: "grant_plan",
      targetUserId: id,
      details: { tier, subscriptionId: result.subscriptionId, days: COMPED_DAYS },
    });
    return Response.json({ ok: true });
  }

  if (body.action === "change_plan") {
    if (body.tier !== "main") {
      return Response.json({ error: "Only an upgrade from Trial to Main is allowed" }, { status: 400 });
    }
    const trial = await getLiveTrialSubscription(id);
    const hasMain = await hasLiveSubscription(id, "main");
    if (!trial && !hasMain) {
      return Response.json({ error: "Only an upgrade from Trial to Main is allowed" }, { status: 409 });
    }

    let mainSubscriptionId: string | null = null;
    if (!hasMain && trial) {
      const result = await createCompedSubscription(
        id,
        "main",
        `autommerce-admin-upgrade-${trial.stripeSubscriptionId}`
      );
      if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
      mainSubscriptionId = result.subscriptionId;
    }

    await settleTrialOnUpgrade(id);
    if (trial) {
      await db
        .from("billing_subscriptions")
        .update({ status: "canceled", canceled_at: new Date().toISOString() })
        .eq("stripe_subscription_id", trial.stripeSubscriptionId);
    }
    await writeAuditLog({
      adminEmail: admin.email,
      action: "upgrade_to_main",
      targetUserId: id,
      details: {
        trialSubscriptionId: trial?.stripeSubscriptionId ?? null,
        mainSubscriptionId,
        days: COMPED_DAYS,
      },
    });
    return Response.json({ ok: true });
  }

  const { data: sub, error } = await db
    .from("billing_subscriptions")
    .select("stripe_subscription_id, status, tier_id")
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
    if (sub.tier_id !== "main") {
      return Response.json({ error: "Extra days are only available on Main" }, { status: 409 });
    }
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

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
