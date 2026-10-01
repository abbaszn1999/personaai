# Website vs. Product — Gap Analysis

*Compares `Documentation/PRODUCT_BRIEF.md` (what the tool really does) with the marketing site in `website/` (`/`, `/features`, `/pricing`, `/contact`). Reviewed 1 Oct 2026.*

**Bottom line:** the site already covers the core story well and its numbers match the code. It needs **no new feature pages**. It needs (1) **two legal pages**, (2) **three small sections** that sell real differentiators the site is silent about, and (3) **three wording fixes** where a claim is stronger than what the code does.

---

## 1. What the site gets right (verified against code)

| Site claim | Verified in code |
|---|---|
| Trial $450 / 30 days; Main $1,500/mo + 3 % GMV | `src/modules/billing/constants.ts`, `src/lib/attribution/constants.ts` |
| 50k/100k session units, 50/100 live min, 12.5k/25k garment units | same |
| Top-ups $2.50 / $0.80 / $1.20 and pack ranges | `src/lib/billing/pricing.ts` |
| Avatar = 1.25 units, try-on 1.875 + 1 per extra | `pricing.ts` (Pruna nano-dollar costs) |
| Rollover capped at 2× include; $0.50 minimum invoice | `ROLLOVER_CAP_MULTIPLIER`, `GMV_MIN_COMMISSION_CENTS` |
| Up to 11 garments per render, 3 profiles, 90-second live | `MAX_TRY_ON_GARMENTS`, `MAX_TRYON_PROFILES`, `REALTIME_TRYON_SESSION_CAP_SECONDS` |
| Shadow DOM, no iframe; live engine is a separate bundle | `widget/src/main.tsx`, `decart-runtime-shim.ts` |
| Shopify custom app (`read_products`), no token stored | `src/lib/shopify/client.ts` |
| WooCommerce application password; AES-256-GCM secrets | `src/lib/woocommerce/client.ts`, `crypto.ts` |
| Kill switch + token rotation; 4 studio backdrops | `ws-branding-editor.tsx` |
| Catalog-grounded stylist, no invented prices | `guardrails.md`, `agent.ts` |

## 2. Wording to fix (claims stronger than the code)

These are the only places the site could be challenged by a technical buyer. Recommend softening, not removing.

1. **"Sized from your charts" / "Measurements × your size charts"** (home look 03, features chapter 05, merchant copy).
   *Reality:* the size shown on a product card is a **BMI-band heuristic** (`fit-metrics.ts`); the model-based fit analysis is a placeholder. Size charts *are* real, and they drive a **deterministic size filter** in retrieval (±5 cm bands), so recommended products are filtered to sizes that fit — but the label on the card is not computed from the chart.
   *Suggested copy:* "Products are filtered to sizes that fit their measurements, using your size charts." (accurate) — or confirm with the team that chart-based labels are shipping and keep as is.

2. **"Row-level security, deny by default"** (features specs).
   *Reality:* RLS is enabled on `users` and `sessions` only, with no policies; the app uses a service-role client. It is a backstop.
   *Suggested copy:* "Database locked to the server. No public access to merchant or shopper data." and drop "Row-level security" unless RLS is extended to all tables.

3. **"The selfie is used once, then discarded"** (features chapter 01 / specs).
   *Reality:* correct in spirit and in the shopper UI ("never stored"), but the server keeps the photo **in memory up to 2 hours** and the image provider deletes uploads after **30 minutes**.
   *Suggested copy:* "Never saved to a database. Held briefly in memory to build the avatar, then discarded." Matches what a privacy policy must say anyway.

Also verify (no change needed unless wrong): site says live try-on is "billed by the second at $1.20/min" — code bills per second against a minutes wallet; consistent.

## 3. Real differentiators the site does not sell yet

Ranked by buyer impact.

| # | Differentiator in the product | On site today | Recommendation |
|---|---|---|---|
| 1 | **Attribution and ROI proof**: attributed-sales ledger, 7-day window, `_persona` line tag + device match, refunds reversed, ROI per $ spent, order-tracking health | Only an FAQ answer; no window stated, no ROI | **Add a section** (features, merchant block; and one FAQ line on pricing) |
| 2 | **Merchant control over the agent**: hard rules (`never_pair`, exclude items, max price spread) + style guide + budget-aware bundles (up to 5 looks) | "Understands budget and occasion" only | **Add a section** ("You set the rules") to the Stylist chapter / merchant block |
| 3 | **Bill-shock protection**: spend cap, usage alerts, usage stops at zero, suggested top-up, 3-day past-due grace | Not mentioned | **Add 2 FAQ items** on `/pricing` (spend cap; what happens at zero) |
| 4 | **Privacy design** for shopper photo, email-only OTP sign-in (no passwords), measurements hidden from merchant | Fragments in specs | **Add a short "Privacy by design" section** and link to the privacy page |
| 5 | Audience types incl. kids profiles; 3 profiles per account | Profiles mentioned, kids not | One-line mention in Avatar chapter |
| 6 | Branding depth (WCAG contrast badge, font picker, radius, suggested replies) | Covered in the Brand-it step | No change |
| 7 | Search relaxation ("never presents widened results as exact") | Not mentioned | Optional one-liner under Stylist facts |

## 4. Pages: add, defer, or skip

### Add now (required before real traffic)
- **`/privacy`** — the product collects shopper emails, measurements and face photos and the site has a contact form. A privacy policy is a legal necessity, not a marketing option. Content must match §4 of the brief (what is stored, for how long, who sees it).
- **`/terms`** — Trial is a $450 paid, non-renewing offer and Main carries a GMV fee; the terms should state attribution rules, billing, rollover and cancellation.
- Add both to the footer and to the mobile menu.

### Defer (build when the product is ready)
- **`/docs` or a setup guide (Shopify + WooCommerce)** — valuable, but the flows are still changing and the real steps live in the dashboard. Better as a "How to connect" help centre once stable. Until then, the home page "Connect / Brand it / Paste" steps are enough.
- **`/security`** — only after fixing wording item #2; until then a short section inside `/features` is safer than a standalone page.
- **Integrations page** — only two real integrations exist (Shopify, WooCommerce). A page would look thin; a section is enough. Do **not** advertise Custom/headless, Shopify App Store or a WordPress plugin: none exist.

### Skip (nothing real to put there)
- **Customer logos, testimonials, case studies, stats** — there is no verified data in the repo. Fabricated social proof would be a trust and legal risk. Add only when real.
- **Blog, changelog, careers, about** — not needed for the launch goal (merchants starting a trial).
- **Arabic / multi-language site** — the product itself has no i18n/RTL, so a localized site would over-promise. Revisit if the widget gains RTL.
- **A separate "shopping assistant" product page** — the non-fashion chat agents are stubs; the website should keep talking about the fashion try-on + stylist only.

## 5. Suggested change list (in priority order)

1. Create `/privacy` and `/terms`; link in footer + mobile menu.
2. Fix the three wording items in §2.
3. Features page: add an **"Attribution and ROI"** block (7-day window, ledger, ROI, tracking health) in the merchant section, with a visual using the existing mock-data style.
4. Features page: extend Stylist chapter with **"You set the rules"** (hard rules, style guide, budget bundles).
5. Pricing FAQ: add *"Can I cap what I spend?"* (spend cap, alerts, stops at zero) and *"How long is the attribution window?"* (7 days).
6. Features: "Privacy by design" strip linking to `/privacy`.
7. Avatar chapter: mention kids and family profiles.

## 6. Open questions for the product team

- Does the shopper-visible size label come from charts or from the BMI heuristic today? (Decides wording item #1.)
- Is RLS intended to be extended to all tables? (Decides wording item #2.)
- Is the mobile **floating assistant** mode and the **full-page try-on** mode the same product on one snippet, or two offerings? (Brand doc colours them separately; the website currently shows one.)
- Which legal entity and jurisdiction should the privacy policy and terms name? (Needed to write `/privacy` and `/terms`.)
