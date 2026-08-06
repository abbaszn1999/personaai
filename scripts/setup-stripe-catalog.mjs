import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  throw new Error("Set STRIPE_SECRET_KEY before running setup:stripe");
}

const stripe = new Stripe(secretKey, {
  maxNetworkRetries: 2,
  appInfo: { name: "Autommerce catalog setup", version: "0.1.0" },
});

const catalog = [
  {
    env: "STRIPE_PRICE_WEARABLE_FIXED",
    lookupKey: "autommerce_wearable_fixed_monthly",
    name: "Autommerce Wearable Fixed",
    description: "5,000 image renders and 100 live try-on minutes per billing period.",
    amount: 200_000,
    recurring: { interval: "month" },
  },
  {
    env: "STRIPE_PRICE_UNWEARABLE_FIXED",
    lookupKey: "autommerce_unwearable_fixed_monthly",
    name: "Autommerce Shopping Assistant Fixed",
    description: "Unlimited shopping-assistant conversations using the merchant's OpenAI key.",
    amount: 150_000,
    recurring: { interval: "month" },
  },
  {
    env: "STRIPE_PRICE_CREDITS_STARTER",
    lookupKey: "autommerce_image_credits_500",
    name: "Autommerce Image Credits — 500",
    amount: 10_000,
  },
  {
    env: "STRIPE_PRICE_CREDITS_GROWTH",
    lookupKey: "autommerce_image_credits_1500",
    name: "Autommerce Image Credits — 1,500",
    amount: 25_000,
  },
  {
    env: "STRIPE_PRICE_CREDITS_SCALE",
    lookupKey: "autommerce_image_credits_3300",
    name: "Autommerce Image Credits — 3,300",
    amount: 50_000,
  },
  {
    env: "STRIPE_PRICE_LIVE_MINUTE",
    lookupKey: "autommerce_live_tryon_minute",
    name: "Autommerce Live Try-On Minute",
    amount: 120,
  },
];

for (const item of catalog) {
  const existing = await stripe.prices.list({
    lookup_keys: [item.lookupKey],
    active: true,
    limit: 1,
  });
  let price = existing.data[0];

  if (!price) {
    const product = await stripe.products.create(
      {
        name: item.name,
        description: item.description,
        metadata: { autommerce_catalog_key: item.lookupKey },
      },
      { idempotencyKey: `autommerce-product-${item.lookupKey}` }
    );
    price = await stripe.prices.create(
      {
        product: product.id,
        currency: "usd",
        unit_amount: item.amount,
        lookup_key: item.lookupKey,
        ...(item.recurring ? { recurring: item.recurring } : {}),
        metadata: { autommerce_catalog_key: item.lookupKey },
      },
      { idempotencyKey: `autommerce-price-${item.lookupKey}` }
    );
  }

  console.log(`${item.env}=${price.id}`);
}

console.log(
  "\nConfigure the Stripe Customer Portal and webhook destination separately, then add " +
    "STRIPE_WEBHOOK_SECRET, STRIPE_PORTAL_CONFIGURATION_ID, APP_URL, and the values above."
);
