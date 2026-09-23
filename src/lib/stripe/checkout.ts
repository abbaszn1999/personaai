import type Stripe from "stripe";
import {
  attachCheckoutSession,
  createBillingOrder,
  getOrCreateBillingAccount,
  hasLiveSubscription,
  setStripeCustomerId,
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
  if (item.kind === "subscription" && (await hasLiveSubscription(input.user.id))) {
    throw new Error("An active or pending subscription already exists");
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
