import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import {
  getPurchaseKeyForPriceId,
  getStripeServerConfig,
  STRIPE_CATALOG,
} from "@/lib/stripe/config";
import { getPlanTier } from "@/modules/billing/constants";
import {
  shouldBillRemainingOnDelete,
  shouldStopTrialRenewal,
  trialPeriodOpen,
  trialWasPaid,
} from "@/lib/billing/trial-carryover";
import {
  applyTrialCarryover,
  claimStripeEvent,
  finishStripeEvent,
  fulfillBillingOrder,
  getBillingAccountByCustomerId,
  getBillingOrderById,
  getBillingOrderByPaymentIntent,
  getLiveTrialSubscription,
  refundBillingOrder,
  updateBillingOrder,
  upsertBillingSubscription,
} from "@/lib/db/billing";
import { attachGmvCommission, invoicePeriodEndIso } from "@/lib/attribution/invoice";

export const runtime = "nodejs";

function stripeId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function isoFromUnix(value: number | null | undefined): string | null {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

async function syncSubscription(subscription: Stripe.Subscription, eventCreated: number): Promise<void> {
  const customerId = stripeId(subscription.customer);
  const item = subscription.items.data[0];
  if (!customerId || !item) throw new Error("Stripe subscription is missing customer or price");

  const purchaseKey = getPurchaseKeyForPriceId(item.price.id);
  if (!purchaseKey) throw new Error(`Unknown Stripe subscription price: ${item.price.id}`);
  const catalogItem = STRIPE_CATALOG[purchaseKey];
  if (catalogItem.kind !== "subscription" || !catalogItem.tierId) {
    throw new Error(`Stripe price ${item.price.id} is not a subscription catalog item`);
  }

  const account = await getBillingAccountByCustomerId(customerId);
  const userId = subscription.metadata.autommerce_user_id || account?.userId;
  if (!userId) throw new Error(`No Autommerce account is linked to Stripe customer ${customerId}`);

  const rawSubscription = subscription as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  const rawItem = item as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  const productId = stripeId(item.price.product);
  const ok = await upsertBillingSubscription({
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripeProductId: productId,
    stripePriceId: item.price.id,
    tierId: catalogItem.tierId,
    status: subscription.status,
    currentPeriodStart: isoFromUnix(
      rawSubscription.current_period_start ?? rawItem.current_period_start
    ),
    currentPeriodEnd: isoFromUnix(
      rawSubscription.current_period_end ?? rawItem.current_period_end
    ),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: isoFromUnix(subscription.canceled_at),
    stripeEventCreatedAt: new Date(eventCreated * 1000).toISOString(),
  });
  if (!ok) throw new Error("Unable to synchronize Stripe subscription");

  if (catalogItem.tierId === "trial") await stopTrialRenewal(subscription.id);

  if (catalogItem.tierId === "main" && subscription.status === "active") {
    await settleTrialOnUpgrade(userId);
  }
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "resource_missing");
}

/** Reads Stripe's current state, since this event may be older than a cancel that already ran. */
async function stopTrialRenewal(subscriptionId: string): Promise<void> {
  let current: Stripe.Subscription;
  try {
    current = await getStripe().subscriptions.retrieve(subscriptionId);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  if (
    !shouldStopTrialRenewal({
      tierId: "trial",
      status: current.status,
      cancelAtPeriodEnd: current.cancel_at_period_end,
    })
  ) {
    return;
  }
  await getStripe().subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

/** Moves unused Trial units into the wallets, then ends Trial without refunding the $450. */
async function settleTrialOnUpgrade(userId: string): Promise<void> {
  const trial = await getLiveTrialSubscription(userId);
  if (!trial) return;

  let current: Stripe.Subscription | null = null;
  try {
    current = await getStripe().subscriptions.retrieve(trial.stripeSubscriptionId);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  const status = current?.status ?? trial.status;

  if (trialWasPaid(status) && trialPeriodOpen(trial.currentPeriodEnd)) {
    if (!trial.currentPeriodStart) throw new Error("Trial subscription has no billing period start");
    const allowance = getPlanTier("trial");
    await applyTrialCarryover({
      userId,
      trialSubscriptionId: trial.stripeSubscriptionId,
      periodStartIso: trial.currentPeriodStart,
      sessionAllowance: allowance.monthlySessionUnits,
      liveAllowanceSeconds: allowance.monthlyLiveTryOnSeconds,
      garmentAllowance: allowance.monthlyGarmentUnits,
    });
  }

  if (!current || current.status === "canceled" || current.status === "incomplete_expired") return;
  await getStripe().subscriptions.cancel(trial.stripeSubscriptionId, {
    prorate: false,
    invoice_now: false,
  });
}

async function processCheckoutSession(session: Stripe.Checkout.Session, event: Stripe.Event): Promise<void> {
  const orderId = session.metadata?.autommerce_order_id;
  if (!orderId) throw new Error("Checkout Session has no Autommerce order id");
  const order = await getBillingOrderById(orderId);
  if (!order) throw new Error(`Billing order ${orderId} was not found`);

  const paymentIntentId = stripeId(session.payment_intent) ?? "";
  const subscriptionId = stripeId(session.subscription);
  await updateBillingOrder(orderId, {
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId || null,
    stripe_subscription_id: subscriptionId,
    status:
      order.kind === "subscription"
        ? "processing"
        : session.payment_status === "paid"
          ? "paid"
          : "processing",
    paid_at: session.payment_status === "paid" ? new Date().toISOString() : null,
  });

  if (order.kind === "subscription") {
    if (!subscriptionId) throw new Error("Subscription Checkout has no subscription id");
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    await syncSubscription(subscription, event.created);
    await updateBillingOrder(orderId, {
      status: "fulfilled",
      fulfilled_by_event_id: event.id,
      fulfilled_at: new Date().toISOString(),
    });
    return;
  }

  if (session.payment_status !== "paid") return;
  await fulfillBillingOrder({
    orderId,
    eventId: event.id,
    checkoutSessionId: session.id,
    paymentIntentId,
    // The trusted catalog stores pre-tax prices; Stripe separately validates and collects tax.
    amountTotal: session.amount_subtotal ?? -1,
    currency: session.currency ?? "",
  });
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const raw = invoice as unknown as {
    subscription?: string | { id: string } | null;
    parent?: {
      subscription_details?: {
        subscription?: string | { id: string } | null;
      } | null;
    } | null;
  };
  return stripeId(raw.subscription ?? raw.parent?.subscription_details?.subscription);
}

async function processRefundedCharge(charge: Stripe.Charge, eventId: string): Promise<void> {
  const paymentIntentId = stripeId(charge.payment_intent);
  if (!paymentIntentId) return;
  const order = await getBillingOrderByPaymentIntent(paymentIntentId);
  if (!order) return;

  if (charge.refunded && charge.amount_refunded >= charge.amount) {
    await refundBillingOrder(order.id, eventId);
  } else {
    await updateBillingOrder(order.id, { refund_review_required: true });
  }
}

async function processRenewalInvoice(invoice: Stripe.Invoice): Promise<void> {
  if (invoice.status !== "draft" || invoice.billing_reason !== "subscription_cycle" || !invoice.id) return;
  const customerId = stripeId(invoice.customer);
  if (!customerId) return;
  const account = await getBillingAccountByCustomerId(customerId);
  if (!account) return;
  await attachGmvCommission({
    userId: account.userId,
    stripeCustomerId: customerId,
    stripeInvoiceId: invoice.id,
    stripeSubscriptionId: subscriptionIdFromInvoice(invoice),
    untilIso: invoicePeriodEndIso(invoice),
    idempotencyKey: `gmv:${invoice.id}`,
  });
}

async function billRemainingGmv(subscription: Stripe.Subscription): Promise<void> {
  const customerId = stripeId(subscription.customer);
  if (!customerId) return;
  const account = await getBillingAccountByCustomerId(customerId);
  if (!account) return;
  await attachGmvCommission({
    userId: account.userId,
    stripeCustomerId: customerId,
    stripeInvoiceId: null,
    stripeSubscriptionId: null,
    untilIso: new Date().toISOString(),
    idempotencyKey: `gmv-final:${subscription.id}`,
  });
}

async function processEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await processCheckoutSession(event.data.object as Stripe.Checkout.Session, event);
      return;
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.autommerce_order_id;
      if (orderId) await updateBillingOrder(orderId, { status: "payment_failed" });
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await syncSubscription(event.data.object as Stripe.Subscription, event.created);
      return;
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await syncSubscription(subscription, event.created);
      const priceId = subscription.items.data[0]?.price.id;
      const purchaseKey = priceId ? getPurchaseKeyForPriceId(priceId) : null;
      const tierId = purchaseKey ? STRIPE_CATALOG[purchaseKey].tierId ?? null : null;
      if (shouldBillRemainingOnDelete(tierId)) await billRemainingGmv(subscription);
      return;
    }
    case "invoice.created":
      await processRenewalInvoice(event.data.object as Stripe.Invoice);
      return;
    case "invoice.paid":
    case "invoice.payment_failed": {
      const subscriptionId = subscriptionIdFromInvoice(event.data.object as Stripe.Invoice);
      if (!subscriptionId) return;
      const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
      await syncSubscription(subscription, event.created);
      return;
    }
    case "charge.refunded":
      await processRefundedCharge(event.data.object as Stripe.Charge, event.id);
      return;
    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = stripeId(dispute.charge);
      if (!chargeId) return;
      const charge = await getStripe().charges.retrieve(chargeId);
      const paymentIntentId = stripeId(charge.payment_intent);
      if (!paymentIntentId) return;
      const order = await getBillingOrderByPaymentIntent(paymentIntentId);
      if (order) await updateBillingOrder(order.id, { refund_review_required: true });
      return;
    }
    default:
      return;
  }
}

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing Stripe signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      getStripeServerConfig().webhookSecret
    );
  } catch (error) {
    console.error("[api/stripe/webhook signature]", error);
    return Response.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  const claimed = await claimStripeEvent({
    id: event.id,
    type: event.type,
    apiVersion: event.api_version ?? null,
    payload: event as unknown as Record<string, unknown>,
    createdAt: new Date(event.created * 1000).toISOString(),
  });
  if (!claimed) return Response.json({ received: true, duplicate: true });

  try {
    await processEvent(event);
    await finishStripeEvent(event.id, "processed");
    return Response.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stripe webhook error";
    console.error(`[api/stripe/webhook ${event.type}]`, error);
    await finishStripeEvent(event.id, "failed", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
