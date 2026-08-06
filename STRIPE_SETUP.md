# Stripe setup — step by step

Follow these steps in order. Each step says exactly where to click in the Stripe Dashboard (or
what command to run) and which `.env.local` line it fills in.

⚠️ **You currently have a LIVE secret key (`sk_live_...`) in `.env.local`.** Do not develop or
test against this. Switch to a **test** key first (step 1) — live mode will attempt to charge
real cards. You'll swap back to the live key only when you deploy to production (step 8).

---

## Step 1 — Switch to a test-mode secret key

1. Go to the [Stripe Dashboard](https://dashboard.stripe.com/).
2. Top-right corner: make sure the **"Test mode"** toggle is ON (it's off right now, since your
   key starts with `sk_live_`).
3. Go to **Developers → API keys**.
4. Copy the **Secret key** shown there (starts with `sk_test_...`).
5. In `.env.local`, replace the value:

   ```bash
   STRIPE_SECRET_KEY=sk_test_...   # paste your test key here
   ```

Everything below assumes Test mode is on.

---

## Step 2 — Create your products/prices automatically

You do **not** need to create anything by hand in the Dashboard for this part — a script does it
for you via the Stripe API.

Run:

```bash
pnpm setup:stripe
```

This creates 6 Products (with their Prices) in your Stripe **test** account and prints 6 lines
like:

```
STRIPE_PRICE_WEARABLE_FIXED=price_1AbCdEf...
STRIPE_PRICE_UNWEARABLE_FIXED=price_1AbCdEf...
STRIPE_PRICE_CREDITS_STARTER=price_1AbCdEf...
STRIPE_PRICE_CREDITS_GROWTH=price_1AbCdEf...
STRIPE_PRICE_CREDITS_SCALE=price_1AbCdEf...
STRIPE_PRICE_LIVE_MINUTE=price_1AbCdEf...
```

Copy those 6 lines into `.env.local`, replacing the `STRIPE_PRICE_...` placeholders (add the
section if it doesn't exist yet). Nothing to click in the Dashboard — you can open
**Products** in the Dashboard afterward just to visually confirm they exist.

---

## Step 3 — Webhook secret (skipping local CLI for now)

Stripe needs a real, reachable URL to deliver webhook events to (payment succeeded, subscription
updated, etc). `localhost` isn't reachable from Stripe's servers, so without a tunnel tool (like
the Stripe CLI or ngrok), **webhooks can't be delivered while developing locally.**

Since you're skipping that for now, put a placeholder in `.env.local` so the app still boots:

```bash
STRIPE_WEBHOOK_SECRET=whsec_placeholder_not_yet_configured
```

This means: locally, you can create Checkout sessions and get redirected back correctly, but a
purchase will **not** actually grant credits/subscription — nothing calls
`/api/stripe/webhook` yet, so the order stays `pending`/`paid` and never reaches `fulfilled`.
That's expected. Full fulfillment testing happens in Step 8 (after deploying), where Stripe can
reach a real public URL and you register the webhook properly through the Dashboard.

If you want to confirm end-to-end fulfillment sooner without deploying, the two options are
running `stripe listen` (Stripe CLI) or `ngrok http 3000` — both act as a temporary public tunnel
to your machine. Either can be added later; it's not required to keep building.

---

## Step 4 — Confirm `APP_URL`

`.env.local` already has:

```bash
APP_URL=http://localhost:3000
```

Leave this as-is for local dev. No action needed.

---

## Step 5 — Restart the dev server

Env vars are only read when the process starts:

```bash
pnpm dev
```

(Stop and restart it if it's already running.)

---

## Step 6 — Test the Checkout redirect (partial test, no fulfillment yet)

This confirms Checkout session creation and the return flow work — it does **not** confirm
credits/subscriptions get granted, since that needs the webhook (Step 3 was skipped for now).

1. Open the app, go to **Settings → Billing**, and try buying a credit bundle or subscribing to
   a plan.
2. You'll be redirected to a Stripe-hosted Checkout page. Use a test card:
   - Card number: `4242 4242 4242 4242`
   - Expiry: any future date, e.g. `12/34`
   - CVC: any 3 digits, e.g. `123`
   - ZIP: any, e.g. `12345`
3. Complete checkout. You should be redirected back to the app with a "payment received,
   confirming..." style notice.
4. The billing page will **not** update (no webhook delivered yet) — that's expected right now,
   not a bug. You can confirm the order was created in Supabase (`billing_orders` table, status
   `paid`, waiting on fulfillment).
5. To test a declined payment instead, use card `4000 0000 0000 0002` — confirm the Checkout
   page itself shows a decline, before even reaching your app.

Full fulfillment (credits/subscription actually landing) is verified once in Step 8, after you
deploy and register a real webhook endpoint.

---

## Step 7 — (Optional) Customer Portal

Only needed for the "Manage Billing" button (letting customers update their card or cancel).

1. Dashboard → **Settings → Billing → Customer portal**.
2. Turn on: payment-method updates, invoice history, cancel-at-period-end.
3. Turn off: plan/price switching (Hybrid plans are handled outside Stripe).
4. Save. The configuration ID appears in the page URL or via **Developers → API** as
   `bpc_...`.
5. Add it to `.env.local`:

   ```bash
   STRIPE_PORTAL_CONFIGURATION_ID=bpc_...
   ```

If you skip this, the button still works using Stripe's default portal settings.

---

## Step 8 — Deploying (do this once you're ready to deploy)

The app is being deployed to **Render**. Full step-by-step deploy instructions — creating the
Web Service, every environment variable to set there, updating `APP_URL`/Google OAuth, and
registering the real Stripe webhook against your live Render URL — are in
[`RENDER_DEPLOY.md`](./RENDER_DEPLOY.md). It picks up right where this file leaves off: you'll
still be in Stripe **Test mode** at first (verifying the full webhook-fulfilled flow works, which
you couldn't test locally without a tunnel), then switch to live keys/prices only when you're
ready to accept real payments (see the launch checklist below).

---

## Reference — what each variable is (for later)

| Variable | Test mode source | Live mode source |
|---|---|---|
| `STRIPE_SECRET_KEY` | Dashboard → Developers → API keys (Test mode on) | Same page, Test mode off |
| `STRIPE_WEBHOOK_SECRET` | `stripe listen` CLI output | Dashboard → Webhooks → your endpoint |
| `STRIPE_PRICE_*` (6 vars) | `pnpm setup:stripe` output | `pnpm setup:stripe` output (run again with live key) |
| `STRIPE_PORTAL_CONFIGURATION_ID` | Dashboard → Settings → Billing → Customer portal | Same, live mode |
| `APP_URL` | `http://localhost:3000` | Your real `https://` domain |
| `STRIPE_AUTOMATIC_TAX_ENABLED` | `false` unless Stripe Tax is set up | same |
| `STRIPE_PAST_DUE_GRACE_DAYS` | `3` (days a past-due subscription keeps access) | same |

## Launch checklist (before accepting real money)

1. Complete all flows in test mode with test cards, including a declined card.
2. Confirm each successful payment produces exactly one fulfillment (resend the same webhook
   event from the Dashboard's **Webhooks → event → Resend** and confirm it doesn't double-grant).
3. Confirm failed/canceled Checkout sessions grant nothing.
4. Remove any account's `legacy_test` access only after that real customer completes Checkout.
5. Never mix test and live keys/price IDs in the same environment.
