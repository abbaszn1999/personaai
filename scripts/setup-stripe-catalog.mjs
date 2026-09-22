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
    env: "STRIPE_PRICE_PLAN_TRIAL",
    lookupKey: "autommerce_plan_trial_monthly",
    name: "Persona Trial",
    description: "30 days with 50,000 session units, 50 live minutes, and 12,500 garment units.",
    amount: 45_000,
    recurring: { interval: "month" },
  },
  {
    env: "STRIPE_PRICE_PLAN_MAIN",
    lookupKey: "autommerce_plan_main_monthly",
    name: "Persona Main",
    description: "Monthly plan with 100,000 session units, 100 live minutes, and 25,000 garment units.",
    amount: 150_000,
    recurring: { interval: "month" },
  },
  {
    env: "STRIPE_PRICE_GARMENT_UNITS",
    lookupKey: "autommerce_garment_units_100",
    name: "Persona Garment Units — 100",
    description: "100 garment units at cost ($0.008 each).",
    amount: 80,
  },
  {
    env: "STRIPE_PRICE_SESSION_UNITS",
    lookupKey: "autommerce_session_units_1000",
    name: "Persona Session Units — 1,000",
    description: "1,000 session units at cost ($0.0025 each).",
    amount: 250,
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
