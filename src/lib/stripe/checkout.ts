import type Stripe from "stripe";
import { subscriptionCheckoutBlock } from "@/lib/billing/plan-checkout";
import {
  attachCheckoutSession,
  createBillingOrder,
  getOrCreateBillingAccount,
  hasLiveSubscription,
  hasUsedTrial,
  listOpenSubscriptionOrders,
  setStripeCustomerId,
  updateBillingOrder,
} from "@/lib/db/billing";
import { getStripe } from "./client";
import {
  getStripePriceId,
  getStripeServerConfig,
  STRIPE_CATALOG,
  STRIPE_CURRENCY,
  type StripePurchaseKey,
} from "./config";

interface CheckoutUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

async function getOrCreateStripeCustomer(user: CheckoutUser): Promise<string> {
  const account = await getOrCreateBillingAccount(user.id);
  if (!account) throw new Error("Unable to initialize billing account");
  if (account.stripeCustomerId) return account.stripeCustomerId;

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined;
  const customer = await getStripe().customers.create(
    {
      email: user.email,
      name,
      metadata: { autommerce_user_id: user.id },
    },
    { idempotencyKey: `autommerce-customer-${user.id}` }
  );
  if (!(await setStripeCustomerId(user.id, customer.id))) {
    throw new Error("Unable to save Stripe customer");
  }
  return customer.id;
}

/**
 * One subscription checkout at a time. A second open tab could otherwise buy Trial twice, or
 * buy it again in the seconds before the paid session's webhook marks it used.
 */
async function closeEarlierSubscriptionCheckouts(userId: string): Promise<void> {
  const orders = await listOpenSubscriptionOrders(userId);
  for (const order of orders) {
    if (!order.stripeCheckoutSessionId) {
      await updateBillingOrder(order.id, { status: "canceled" });
      continue;
    }
    const session = await getStripe().checkout.sessions.retrieve(order.stripeCheckoutSessionId);
    if (session.status === "complete") {
      throw new Error("A subscription payment is still being confirmed. Try again in a minute.");
    }
    if (session.status === "open") {
      await getStripe().checkout.sessions.expire(session.id);
    }
    await updateBillingOrder(order.id, { status: "canceled" });
  }
}

export interface CreateCheckoutInput {
  user: CheckoutUser;
  purchaseKey: StripePurchaseKey;
  quantity?: number;
}

export interface CreatedCheckout {
  orderId: string;
  sessionId: string;
  url: string;
}

export async function createStripeCheckout(input: CreateCheckoutInput): Promise<CreatedCheckout> {
  const item = STRIPE_CATALOG[input.purchaseKey];
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Invalid checkout quantity");
  if (item.kind === "subscription") {
    const [trialUsed, liveSubscription, liveMain] = await Promise.all([
      hasUsedTrial(input.user.id),
      hasLiveSubscription(input.user.id),
      hasLiveSubscription(input.user.id, "main"),
    ]);
    const block = subscriptionCheckoutBlock({
      purchaseKey: item.key,
      trialUsed,
      hasLiveSubscription: liveSubscription,
      hasLiveMain: liveMain,
    });
    if (block) throw new Error(block);
    await closeEarlierSubscriptionCheckouts(input.user.id);
  } else if (!(await hasLiveSubscription(input.user.id, "main"))) {
    throw new Error("Extra balance is available on the Main plan. Upgrade to Main to buy more.");
  }

  const customerId = await getOrCreateStripeCustomer(input.user);
  const order = await createBillingOrder({
    userId: input.user.id,
    kind: item.kind,
    productKey: item.key,
    tierId: item.tierId ?? null,
    quantity,
    creditsToGrant: (item.creditsPerUnit ?? 0) * quantity,
    secondsToGrant: (item.secondsPerUnit ?? 0) * quantity,
    unitsToGrant: item.kind === "session_units" ? (item.unitsPerUnit ?? 0) * quantity : 0,
    expectedAmountCents: item.amountCents * quantity,
    currency: STRIPE_CURRENCY,
    stripeCustomerId: customerId,
  });
  if (!order) throw new Error("Unable to create billing order");

  const config = getStripeServerConfig();
  const metadata = {
    autommerce_order_id: order.id,
    autommerce_user_id: input.user.id,
    autommerce_product_key: item.key,
  };
  const common: Stripe.Checkout.SessionCreateParams = {
    customer: customerId,
    client_reference_id: input.user.id,
    line_items: [{ price: getStripePriceId(item.key), quantity }],
    mode: item.kind === "subscription" ? "subscription" : "payment",
    success_url: `${config.appUrl}/settings/billing?checkout=success&orderId=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.appUrl}/settings/billing?checkout=cancelled&orderId=${order.id}`,
    metadata,
    allow_promotion_codes: true,
    automatic_tax: { enabled: config.automaticTax },
    tax_id_collection: { enabled: config.automaticTax },
    customer_update: { address: "auto", name: "auto" },
  };

  if (item.kind === "subscription") {
    common.subscription_data = { metadata };
  } else {
    common.payment_intent_data = { metadata };
    common.invoice_creation = { enabled: true };
  }

  const session = await getStripe().checkout.sessions.create(common, {
    idempotencyKey: `autommerce-checkout-${order.id}`,
  });
  if (!session.url) throw new Error("Stripe Checkout did not return a URL");
  if (!(await attachCheckoutSession(order.id, session.id, customerId))) {
    throw new Error("Unable to save Stripe Checkout session");
  }

  return { orderId: order.id, sessionId: session.id, url: session.url };
}
