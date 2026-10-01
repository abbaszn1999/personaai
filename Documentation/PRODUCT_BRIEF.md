# Persona AI — Product Brief

*What the tool is, how it works, and what problems it solves. Compiled from the codebase (not from marketing copy). Every claim has a file path so it can be re-verified. Last reviewed: 1 Oct 2026.*

---

## 1. One-paragraph summary

**Persona AI** (by **Autommerce**, tagline "E-commerce with AI Excellence") is a SaaS widget that e-commerce merchants embed on their own storefront with one `<script>` tag. A shopper uploads one selfie plus their measurements, gets an **avatar that keeps their face**, sees the **merchant's real garments rendered on that avatar**, can try clothes **live on their own camera**, and chats with a **stylist agent that only recommends products found in the merchant's catalog** and adds them to the merchant's **own Shopify / WooCommerce cart**. The merchant gets a dashboard to connect the store, map the catalog, set up sizing, brand the widget, go live, and measure the sales Persona attributes (which is also what the GMV fee is based on).

## 2. Problems it solves

| Problem (merchant / shopper) | How Persona addresses it | Evidence |
|---|---|---|
| Shoppers can't judge how clothes look on *them* → low conversion | Avatar built from the shopper's own photo, garments rendered on it | `src/lib/agents/persona-agent.ts`, `src/lib/ai/pruna.ts` |
| Wrong size → returns | Size recommendation from measurements; merchant-side size-chart pipeline | `src/modules/wearable-agent/utils/fit-metrics.ts`, `src/lib/sizing/**` |
| Generic chatbots invent products/prices | Stylist is grounded in a catalog search; hard rules enforce constraints | `src/lib/agents/wearable/persona/skills/guardrails.md`, `hard-rules.ts` |
| Try-on tools live in an iframe, can't touch the cart | Same-page Shadow DOM widget + native cart APIs | `widget/src/main.tsx`, `src/lib/shopify/ajax-cart-client.ts` |
| Merchants can't prove ROI of AI tools | Attributed-sales ledger, funnel, ROI per $ spent | `src/lib/db/analytics.ts`, `src/lib/attribution/*` |
| Size charts are tedious to build | AI-assisted research + a shared registry for global brands | `src/lib/sizing/research.ts`, `src/lib/sizing/seeds/**` |

## 3. Architecture at a glance

- **Dashboard + API**: Next.js app (`src/app/**`), Supabase (Postgres, service-role access), Stripe billing, iron-session cookies.
- **Widget**: separate esbuild bundle (`scripts/build-widget.mjs`) → `public/widget.js` + `widget.css`. React inside a Shadow DOM host. Live-camera engine is a second on-demand bundle (`widget-live.js`).
- **AI providers**: Pruna (`p-image-edit` avatars, `p-image-try-on` garments), Gemini (router, budget allocator, stylist vision, brand discovery, size-chart research, category auto-match), Decart (`lucy-vton-latest`, realtime camera try-on).
- **Search**: "ACS" catalog index (attribute-limited, 30 attributes) with filter + semantic (cosine) retrieval.

## 4. The shopper experience

1. **Open the widget** — display modes: `fullpage` (virtual try-on), `floating` (assistant), `compact` (sign-in/onboarding cards). Mobile uses a bottom-sheet chat.
2. **Sign in** — email + 6-digit code (10-minute TTL). First-time shoppers accept a privacy checkbox. No passwords. (`src/app/api/embed/shopper/*`)
3. **Onboarding (3 taps)** — who is trying on (woman / man / unisex / kids boy / girl / unisex) → height, weight, chest, waist, shoe size → photo (JPEG/PNG/WEBP ≤ 10 MB).
4. **Avatar** — 4 variations generated per shopper (Tailored Blazer, Classic Suit, Relaxed Casual, Elegant Fitted), each on one of 4 fixed studio backdrops; streamed so results appear as they finish. Shopper picks one (or uploads their own).
5. **Profiles** — up to **3 profiles** per shopper account (e.g. self, partner, child). Each has its own measurements, avatar, chat history and outfit; the cart is shared.
6. **Try-on** — garments rendered on the *stored* avatar (never chained from the previous render, to avoid face drift). Up to **11 garments** per render. Slots: outerwear, top, bottom, shoes, dress, other; a new garment replaces whatever occupies its slot. A "scan" animation plays while rendering. Hotspots on the garments open price / size / Add-to-cart.
7. **Live mirror** — WebRTC camera try-on via Decart. **90-second** sessions, billed per second against a minutes wallet. Camera flip, client-side recording (download only, no upload). Loaded only when started.
8. **Stylist chat** — see §5.
9. **Cart** — "Add to cart" calls the merchant's *own* cart in the shopper's browser session (Shopify `/cart/add.js`, WooCommerce Store API). Checkout stays on the merchant's store.

### Privacy of the shopper's photo
- UI states the photo is used to build the avatar and then discarded, never stored.
- Client strips the raw photo before anything reaches `localStorage`.
- Server holds the photo **in memory only** for up to **2 hours** (avoids re-uploading every chat turn), and the image provider deletes uploads after **30 minutes**.
- Body measurements are **not shown to the merchant**.
- Evidence: `use-try-on-agent.ts`, `avatar-cache.ts`, `src/lib/ai/pruna.ts`, `shopper-sign-in.tsx`.

## 5. The stylist agent

- **Router** — one strict tool call picks exactly one mode per message: `filter` (hard constraints: category, brand, price, stock), `cosine` (semantic/descriptive; default on ambiguity), `bundle` (complete outfit), `attribute_variant` ("does this come in navy?"; same product only), `ask_info` (one clarifying question).
- **Search relaxation** — if a filter returns < 3 results it widens in order: price ceiling → price floor → brand → garment subtype → store subcategory. Category is never dropped, and the reply is told when results are widened.
- **Bundles** — require category and budget first. Pipeline: retrieve wide → **budget allocator** (Gemini splits the budget into per-category shares, ≥ 5 % each, trims candidate pools) → **stylist** (vision call, up to **5** coordinated looks with rationale) → **hard rules** validate.
- **Hard rules (merchant-defined, enforced mechanically)** — `exclude_items`, `never_pair`, `max_price_spread`. Violating proposals are dropped, never "repaired".
- **Style guide (soft)** — free-text taste guidance that biases choices but never excludes.
- **Grounding** — the model is told which product cards will render *before* it writes the reply and may only state products/prices/availability from a catalog tool result this turn.
- **Tone** — 2–4 sentences, "like a real stylist texting a client".

## 6. Sizing and fit

**Shopper side (what actually runs today)**
- Size recommendation per product is a **deterministic heuristic** (BMI bands → XS/S/M/L/XL; EU shoe size used directly for shoes). `fit-analysis/skills/analyze-fit.md` is an explicit placeholder: no model-based fit advice yet. (`fit-metrics.ts`, `size-for-product.ts`)
- The "Model stats" panel (Lean/Balanced/Athletic/Broad build, four fit scores) is a styled approximation.

**Merchant side (size-chart pipeline — large, real)**
- 5 stages: Column Mapping → Item Preview → Brand Discovery → Size Chart Research → Active Overview/Publish. (`src/modules/store/sizing/**`, `Documentation/persona_sizing.md`)
- Brand Discovery: Gemini splits brands into *global* vs *private*.
- Global brand charts live in a **shared registry** across merchants (centrally curated); private brands are researched per merchant.
- Chart resolution uses exact `covers_leaves` matching only; unresolved products publish no partial sizing.
- A **deterministic size filter** (no LLM) is used in retrieval: guard bands ±5 cm chest/waist/hip, ±0.5 cm foot length, joint same-size rule.

## 7. The merchant experience

| Step | Where | What happens |
|---|---|---|
| Sign up | `/sign-up` | Email + password (bcrypt, 1-hour verification code) or Google OAuth |
| Qualify | `/onboarding` | 5 questions (role, platform, goal, catalog size, traffic) — informational |
| Create project | `/setup` | Name → Mode → Review |
| Connect store | `/store` → Connection | Shopify, WordPress/WooCommerce (Custom is simulated, not real) |
| Map categories | `/store` → Mapping | Store categories → fixed "Persona taxonomy"; Gemini **Auto-Match** suggests mappings |
| Sizing setup | `/store` → Setup | 5-stage pipeline above, then a full catalog publish |
| Style guide / hard rules | `/store` → Style Guide | Soft guidance for the agent |
| Brand it | `/branding` | Identity, appearance, conversation, embed (see below) |
| Preview | `/preview`, `/try-on` | See the widget exactly as a shopper does; gated until the catalog is indexed |
| Go live | `/branding` → Setup | Copy `<script src=".../widget.js?w=TOKEN" async>`; "Public embed" kill switch; regenerate token |
| Measure | `/analytics`, `/usage` | Attributed KPIs, funnel, sales, usage meters |
| Pay | `/settings/billing` | Stripe plans, wallets, spend cap |

### Store connections
- **Shopify** — "bring your own app": merchant creates a custom app (`read_products`), pastes Client ID/Secret; Persona exchanges them for a ~24 h token via client-credentials (token is **never persisted**, only encrypted ID/secret). No App Store review needed. Webhooks for products and orders.
- **WooCommerce** — WordPress Application Password over REST `/wp-json/wc/v3`. Real brand taxonomy (WC ≥ 9.4), attributes, variations. Webhooks for products and orders.
- **Custom** — simulated only. Native Shopify App Store embed block and a WordPress plugin/shortcode are **not built** (JS snippet only).

### Branding options
Agent name, logo (PNG/JPG/WEBP/SVG ≤ 2 MB), status line, light/dark theme, one of **4 studio backdrops**, brand colour (with WCAG contrast badge), Google Font picker, border radius (square → custom), welcome message, suggested replies (default / custom / off), input placeholder, sign-in message, mobile launcher label, "Live camera try-on" toggle, "Public embed" kill switch, token regeneration. Keyboard save (⌘/Ctrl+S).

### Analytics (Persona-attributed only — never store-wide order data)
- KPIs vs previous equal window (7/30/90 d): sessions, cart items added, cart value, add-to-cart rate, avg item value.
- Funnel: opened widget → engaged → added to cart → placed an order.
- Sales: net/gross/refunds, refund rate, orders, AOV, conversion per 100 sessions, billable vs unbilled GMV, commission, **ROI** (net sales per $1 paid to Persona), top products, breakdown by attribution method.
- Try-on insights (most tried-on products, top recommended sizes), live try-on insights, assistant insights (topics), new vs returning shoppers.
- Order-tracking health: `active / missing / unknown / not_connected`.

### Attribution (basis of the GMV fee)
- Shopify: hidden cart line property `_persona` matched against order webhooks; WooCommerce equivalent; **device-match** fallback (IP/UA hashed, no raw PII).
- **7-day attribution window** from add-to-cart to order. Net of discounts (and tax when prices include it). Refunds reverse the ledger. FX handled. (`src/lib/attribution/*`)

## 8. Pricing and billing (exact, from code)

| | **Trial** | **Main** |
|---|---|---|
| Price | **$450**, one time, 30 days (does not auto-renew) | **$1,500 / month** + **3 % of attributed GMV** |
| Session units | 50,000 | 100,000 / mo |
| Live try-on | 50 min | 100 min / mo |
| Garment units | 12,500 | 25,000 / mo |
| GMV fee | none — sales recorded, not billed | 3 % of paid, attributed GMV (min. invoiceable $0.50, else deferred) |
| Unused units | move to Main on upgrade (only if the Trial was paid) | roll over, capped at 2× monthly include |

**At-cost top-ups**: session units $2.50 / 1,000 (10–10,000 packs); garment units $0.80 / 100 (50–5,000 packs); live minutes $1.20 / min (25–10,000).
**What a unit costs**: 1 session unit = one catalog search ($0.0025). Avatar = 1.25 garment units; try-on first garment = 1.875, each extra = 1. Live is billed per second.
**Guard-rails**: merchant-set **spend cap** (blocks new overage; max $100,000), usage alerts, usage stops at zero (no silent overdraft), 3-day past-due grace, downgrade Main → Trial not available, suggested top-up = 14 days of current burn.
Sources: `src/modules/billing/constants.ts`, `src/lib/billing/pricing.ts`, `src/lib/stripe/config.ts`, `src/lib/attribution/constants.ts`.

## 9. Security and data handling

- Store credentials encrypted **AES-256-GCM**; API never returns them (masked preview only). (`src/lib/utils/crypto.ts`)
- Sessions: iron-session, httpOnly, `sameSite=lax`, secure in prod, 7-day TTL. A separate non-secret `persona_signed_in` cookie lets the marketing site swap CTAs.
- Shopper auth: email OTP, no password. Merchant auth: password + email verification, or Google.
- Admin console is a fully separate session; impersonation and every admin action are written to an **audit log**.
- Embed token in the script URL is the only public credential; kill switch + token rotation.
- Database: RLS is enabled on `users` and `sessions` with no policies (deny to anon); all real access goes through the server-side service-role client — RLS is a backstop, not the main access layer.

## 10. Admin console (Autommerce staff)

Overview (merchants, active subs, MRR, past-due, 30-day churn, signups), merchant search/detail, impersonate, comp Trial/Main, upgrade Trial → Main, extend renewal 1–90 days, cancel at period end, grant wallet balances, delete merchant, paginated audit log.

## 11. What is NOT there (important for what the website may claim)

- **No i18n / RTL / Arabic** support in the widget or agent (English strings only; RTL flagged as unresolved in `widget/src/main.tsx`).
- **No Shopify App Store app or WordPress plugin** — snippet only.
- **Custom/headless store connection is simulated**.
- **Model-based fit advice is a placeholder**; the shown size is a BMI heuristic.
- **Non-wearable "shopping assistant" chat** agents are structural stubs; wearable (fashion) is the real product.
- `/usage` history chart still reads from a mock in places; BYO OpenAI chat usage is informational only.
- `Documentation/DOCUMENTATION.md` is stale (still says billing is frontend-only).
