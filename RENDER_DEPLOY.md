# Deploying to Render

Step by step. Do these in order.

## Step 1 — Push your code to GitHub (if not already)

Render deploys from a git repo (GitHub, GitLab, or Bitbucket). If your code isn't pushed yet:

```bash
git add -A
git commit -m "Prepare for Render deployment"
git push
```

## Step 2 — Create the Web Service

1. Go to [render.com](https://render.com) → **New → Web Service**.
2. Connect your GitHub account and select this repository.
3. Fill in:
   - **Name**: whatever you want (e.g. `autommerce`).
   - **Region**: closest to your users.
   - **Branch**: `main` (or whichever branch you deploy from).
   - **Runtime**: `Node`.
   - **Build Command**:
     ```bash
     corepack enable; NODE_ENV=development pnpm install --frozen-lockfile; pnpm run build
     ```

     The `NODE_ENV=development` here is intentional and only affects the install step: Render
     sets `NODE_ENV=production` for builds by default, which makes `pnpm install` silently skip
     everything in `devDependencies` — including `tailwindcss`, `esbuild`, and other packages
     the build itself needs. `pnpm run build` still produces a normal production build; Next.js
     sets its own internal production mode regardless of this shell variable.
   - **Start Command**:
     ```bash
     pnpm run start
     ```
   - **Instance Type**: Starter is fine to begin with; upgrade later if you see slow cold
     response times (Render's free/starter tiers can spin down when idle).

Don't click "Create Web Service" yet — add the environment variables first (Step 3), since Render
lets you set them on the same creation screen.

## Step 3 — Environment variables

In the **Environment** section of the creation screen (or later under the service's
**Environment** tab), add every variable below. Values marked "→ same as local" can be copied
straight from your `.env.local`; values marked "→ update" need a new production-specific value.

```bash
# Supabase — same as local
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...

# Auth
GOOGLE_CLIENT_SECRET=...        # same as local
GOOGLE_CLIENT_ID=...            # same as local
APP_RESEND_API_KEY=...          # same as local
RESEND_FROM_EMAIL=...           # same as local
SESSION_SECRET=...              # → generate a new random 32+ char string, don't reuse the dev one
APP_URL=https://your-app.onrender.com   # → update once Render assigns your URL (Step 4)

# Secrets encryption
OPENAI_KEY_ENCRYPTION_SECRET=...   # same as local

# AI agents
GEMINI_API_KEY=...              # same as local
GEMINI_IMAGE_MODEL=...          # same as local
GEMINI_IMAGE_SIZE=...           # same as local
OPENAI_CHAT_MODEL=...           # same as local
DECART_API_KEY=...              # same as local
CATALOG_SEARCH_POOL_SIZE=100    # same as local

# Stripe — see STRIPE_SETUP.md Step 8 for where these values come from
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...       # → you'll set this in Step 5, after the service has a URL
STRIPE_PORTAL_CONFIGURATION_ID=...
STRIPE_AUTOMATIC_TAX_ENABLED=false
STRIPE_PAST_DUE_GRACE_DAYS=3
STRIPE_PRICE_WEARABLE_FIXED=...
STRIPE_PRICE_UNWEARABLE_FIXED=...
STRIPE_PRICE_CREDITS_STARTER=...
STRIPE_PRICE_CREDITS_GROWTH=...
STRIPE_PRICE_CREDITS_SCALE=...
STRIPE_PRICE_LIVE_MINUTE=...
```

**Do not add these** — they're local-only:
- `DISABLE_CACHE` — leave unset in production (it disables every cache and does real work on
  every request; only for local testing).
- `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` — only used by the
  `supabase` CLI (`pnpm db:push`, etc.) which you run from your own machine, not by the deployed
  app itself.

Click **Create Web Service**. Render will run the build — the first build takes a few minutes.

## Step 4 — Update `APP_URL` and Google OAuth once you have a real URL

1. Once deployed, Render gives you a URL like `https://autommerce.onrender.com` (shown at the top
   of the service page). If you're attaching a custom domain, do that first (**Settings → Custom
   Domains**) and use that domain instead.
2. Go back to **Environment**, set `APP_URL` to that exact URL (no trailing slash), and save —
   this triggers a redeploy.
3. Google sign-in needs to know about this domain too: go to
   [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials),
   open your OAuth 2.0 Client ID, and add under **Authorized redirect URIs**:

   ```text
   https://your-app.onrender.com/api/auth/google/callback
   ```

   (Keep the `localhost:3000` one too if you still develop locally.)

## Step 5 — Register the Stripe webhook against the live URL

This is the step that was blocked locally (no public URL for Stripe to reach). Now you have one.

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**.
2. **Endpoint URL**:
   ```text
   https://your-app.onrender.com/api/stripe/webhook
   ```
3. Subscribe to these events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `charge.refunded`
   - `charge.dispute.created`
4. Save, then open the endpoint you just created and reveal the **Signing secret**
   (`whsec_...`).
5. Back in Render → **Environment**, replace the placeholder:
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
6. Save — Render redeploys automatically with the new value.

Make sure Stripe's **Test mode** toggle matches whichever key you're using
(`sk_test_...` → keep Test mode on while validating; switch both together for real launch).

## Step 6 — Verify end-to-end

1. On the deployed site, go to **Settings → Billing** and buy a credit bundle with test card
   `4242 4242 4242 4242`.
2. After the Checkout redirect back, the billing page should now actually update (credits
   land) — this is the piece that couldn't be tested locally without a tunnel.
3. In Stripe Dashboard → your webhook endpoint → **Recent deliveries**, confirm the event shows
   a `200` response, not a failure.
4. Resend that same event from the Dashboard's delivery log and confirm it does **not**
   double-grant credits (idempotency check).

## Notes specific to Render

- Render terminates HTTPS in front of your app, so `secure` cookies still work correctly since
  the app is always run with `next start` (production mode) — no extra config needed.
- If you're on Render's free/starter instance type, the service can spin down after inactivity;
  the first request after a spin-down will be slow (~30–60s) while it restarts. This also delays
  the very first webhook delivery after idle — Stripe retries failed webhooks automatically, so
  this normally self-heals, but consider an always-on plan before real launch.
- Database schema/migrations (`supabase/migrations/*.sql`) are applied by you running
  `pnpm db:push` from your own machine against the same Supabase project — Render does not run
  migrations automatically.
