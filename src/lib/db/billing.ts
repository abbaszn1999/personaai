import { db } from "@/lib/supabase/server";
import type { StripeOrderKind, StripePurchaseKey } from "@/lib/stripe/config";

export type BillingAccessMode = "stripe" | "legacy_test";

export interface BillingAccountRow {
  userId: string;
  stripeCustomerId: string | null;
  accessMode: BillingAccessMode;
}

export interface BillingSubscriptionRow {
  userId: string | null;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  tierId: "fixed" | "hybrid";
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface BillingOrderRow {
  id: string;
  userId: string | null;
  kind: StripeOrderKind;
  productKey: StripePurchaseKey;
  tierId: "fixed" | "hybrid" | null;
  quantity: number;
  creditsToGrant: number;
  secondsToGrant: number;
  expectedAmountCents: number;
  currency: string;
  status: string;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeSubscriptionId: string | null;
  refundReviewRequired: boolean;
}

function mapBillingAccount(row: Record<string, unknown>): BillingAccountRow {
  return {
    userId: row.user_id as string,
    stripeCustomerId: (row.stripe_customer_id as string | null) ?? null,
    accessMode: row.access_mode as BillingAccessMode,
  };
}

function mapSubscription(row: Record<string, unknown>): BillingSubscriptionRow {
  return {
    userId: (row.user_id as string | null) ?? null,
    stripeCustomerId: row.stripe_customer_id as string,
    stripeSubscriptionId: row.stripe_subscription_id as string,
    stripePriceId: row.stripe_price_id as string,
    tierId: row.tier_id as "fixed" | "hybrid",
    status: row.status as string,
    currentPeriodStart: (row.current_period_start as string | null) ?? null,
    currentPeriodEnd: (row.current_period_end as string | null) ?? null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
  };
}

function mapOrder(row: Record<string, unknown>): BillingOrderRow {
  return {
    id: row.id as string,
    userId: (row.user_id as string | null) ?? null,
    kind: row.kind as StripeOrderKind,
    productKey: row.product_key as StripePurchaseKey,
    tierId: (row.tier_id as "fixed" | "hybrid" | null) ?? null,
    quantity: Number(row.quantity),
    creditsToGrant: Number(row.credits_to_grant),
    secondsToGrant: Number(row.seconds_to_grant),
    expectedAmountCents: Number(row.expected_amount_cents),
    currency: row.currency as string,
    status: row.status as string,
    stripeCheckoutSessionId: (row.stripe_checkout_session_id as string | null) ?? null,
    stripePaymentIntentId: (row.stripe_payment_intent_id as string | null) ?? null,
    stripeSubscriptionId: (row.stripe_subscription_id as string | null) ?? null,
    refundReviewRequired: Boolean(row.refund_review_required),
  };
}

export async function getOrCreateBillingAccount(userId: string): Promise<BillingAccountRow | null> {
  const { data, error } = await db
    .from("billing_accounts")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true })
    .select("*")
    .single();

  if (!error && data) return mapBillingAccount(data);

  const { data: existing, error: readError } = await db
    .from("billing_accounts")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (readError || !existing) {
    console.error("[db/billing getOrCreateBillingAccount]", error ?? readError);
    return null;
  }
  return mapBillingAccount(existing);
}

export async function setStripeCustomerId(userId: string, stripeCustomerId: string): Promise<boolean> {
  const { error } = await db
    .from("billing_accounts")
    .update({ stripe_customer_id: stripeCustomerId, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) console.error("[db/billing setStripeCustomerId]", error);
  return !error;
}

export async function getBillingAccountByCustomerId(
  stripeCustomerId: string
): Promise<BillingAccountRow | null> {
  const { data, error } = await db
    .from("billing_accounts")
    .select("*")
    .eq("stripe_customer_id", stripeCustomerId)
    .single();
  return error || !data ? null : mapBillingAccount(data);
}

export interface CreateBillingOrderInput {
  userId: string;
  kind: StripeOrderKind;
  productKey: StripePurchaseKey;
  tierId?: "fixed" | null;
  quantity: number;
  creditsToGrant: number;
  secondsToGrant: number;
  expectedAmountCents: number;
  currency: string;
  stripeCustomerId?: string | null;
}

export async function createBillingOrder(input: CreateBillingOrderInput): Promise<BillingOrderRow | null> {
  const { data, error } = await db
    .from("billing_orders")
    .insert({
      user_id: input.userId,
      stripe_customer_id: input.stripeCustomerId ?? null,
      kind: input.kind,
      product_key: input.productKey,
      tier_id: input.tierId ?? null,
      quantity: input.quantity,
      credits_to_grant: input.creditsToGrant,
      seconds_to_grant: input.secondsToGrant,
      expected_amount_cents: input.expectedAmountCents,
      currency: input.currency,
    })
    .select("*")
    .single();
  if (error || !data) {
    console.error("[db/billing createBillingOrder]", error);
    return null;
  }
  return mapOrder(data);
}

export async function attachCheckoutSession(
  orderId: string,
  sessionId: string,
  stripeCustomerId: string
): Promise<boolean> {
  const { error } = await db
    .from("billing_orders")
    .update({
      stripe_checkout_session_id: sessionId,
      stripe_customer_id: stripeCustomerId,
      status: "checkout_open",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);
  if (error) console.error("[db/billing attachCheckoutSession]", error);
  return !error;
}

export async function getBillingOrderForUser(orderId: string, userId: string): Promise<BillingOrderRow | null> {
  const { data, error } = await db
    .from("billing_orders")
    .select("*")
    .eq("id", orderId)
    .eq("user_id", userId)
    .single();
  return error || !data ? null : mapOrder(data);
}

export async function getBillingOrderById(orderId: string): Promise<BillingOrderRow | null> {
  const { data, error } = await db.from("billing_orders").select("*").eq("id", orderId).single();
  return error || !data ? null : mapOrder(data);
}

export async function getBillingOrderByPaymentIntent(paymentIntentId: string): Promise<BillingOrderRow | null> {
  const { data, error } = await db
    .from("billing_orders")
    .select("*")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .single();
  return error || !data ? null : mapOrder(data);
}

export async function updateBillingOrder(
  orderId: string,
  patch: Record<string, unknown>
): Promise<boolean> {
  const { error } = await db
    .from("billing_orders")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) console.error("[db/billing updateBillingOrder]", error);
  return !error;
}

export interface UpsertSubscriptionInput {
  userId: string | null;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripeProductId: string | null;
  stripePriceId: string;
  tierId: "fixed" | "hybrid";
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  stripeEventCreatedAt: string;
}

export async function upsertBillingSubscription(input: UpsertSubscriptionInput): Promise<boolean> {
  if (!input.userId) return false;
  const { error } = await db.rpc("sync_billing_subscription", {
    p_user_id: input.userId,
    p_stripe_customer_id: input.stripeCustomerId,
    p_stripe_subscription_id: input.stripeSubscriptionId,
    p_stripe_product_id: input.stripeProductId ?? "",
    p_stripe_price_id: input.stripePriceId,
    p_tier_id: input.tierId,
    p_status: input.status,
    p_current_period_start: input.currentPeriodStart,
    p_current_period_end: input.currentPeriodEnd,
    p_cancel_at_period_end: input.cancelAtPeriodEnd,
    p_canceled_at: input.canceledAt,
    p_event_created_at: input.stripeEventCreatedAt,
  });
  if (error) console.error("[db/billing upsertBillingSubscription]", error);
  return !error;
}

export async function getLatestBillingSubscription(userId: string): Promise<BillingSubscriptionRow | null> {
  const { data, error } = await db
    .from("billing_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return error || !data ? null : mapSubscription(data);
}

export async function hasLiveSubscription(userId: string): Promise<boolean> {
  const { count, error } = await db
    .from("billing_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["active", "trialing", "past_due", "incomplete"]);
  if (error) {
    console.error("[db/billing hasLiveSubscription]", error);
    return false;
  }
  return (count ?? 0) > 0;
}

export async function claimStripeEvent(input: {
  id: string;
  type: string;
  apiVersion: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}): Promise<boolean> {
  const { error } = await db.from("stripe_webhook_events").insert({
    stripe_event_id: input.id,
    event_type: input.type,
    api_version: input.apiVersion,
    payload: input.payload,
    status: "processing",
    stripe_created_at: input.createdAt,
  });
  if (!error) return true;
  if (error.code === "23505") {
    const retryAt = new Date().toISOString();
    const { data: failedEvent } = await db
      .from("stripe_webhook_events")
      .update({
        status: "processing",
        error_message: null,
        updated_at: retryAt,
      })
      .eq("stripe_event_id", input.id)
      .eq("status", "failed")
      .select("stripe_event_id")
      .maybeSingle();
    if (failedEvent) return true;

    // Recover a worker that died after claiming an event. Fresh concurrent deliveries remain
    // unclaimed, while a processing lease older than five minutes can be retried by Stripe.
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: staleEvent } = await db
      .from("stripe_webhook_events")
      .update({
        status: "processing",
        error_message: null,
        updated_at: retryAt,
      })
      .eq("stripe_event_id", input.id)
      .eq("status", "processing")
      .lt("updated_at", staleBefore)
      .select("stripe_event_id")
      .maybeSingle();
    return Boolean(staleEvent);
  }
  throw new Error(`Unable to claim Stripe event: ${error.message}`);
}

export async function finishStripeEvent(
  eventId: string,
  status: "processed" | "failed",
  errorMessage?: string
): Promise<void> {
  const { error } = await db
    .from("stripe_webhook_events")
    .update({
      status,
      error_message: errorMessage ?? null,
      processed_at: status === "processed" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_event_id", eventId);
  if (error) console.error("[db/billing finishStripeEvent]", error);
}

export async function fulfillBillingOrder(input: {
  orderId: string;
  eventId: string;
  checkoutSessionId: string;
  paymentIntentId: string;
  amountTotal: number;
  currency: string;
}): Promise<boolean> {
  const { data, error } = await db.rpc("fulfill_billing_order", {
    p_order_id: input.orderId,
    p_stripe_event_id: input.eventId,
    p_checkout_session_id: input.checkoutSessionId,
    p_payment_intent_id: input.paymentIntentId,
    p_amount_total: input.amountTotal,
    p_currency: input.currency,
  });
  if (error) throw new Error(`Unable to fulfill billing order: ${error.message}`);
  return Array.isArray(data) ? Boolean(data[0]?.fulfilled) : Boolean(data);
}

export async function refundBillingOrder(orderId: string, eventId: string): Promise<void> {
  const { error } = await db.rpc("refund_billing_order", {
    p_order_id: orderId,
    p_stripe_event_id: eventId,
  });
  if (error) throw new Error(`Unable to refund billing order: ${error.message}`);
}
