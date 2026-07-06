# Autommerce — Brand & Design System

The single source of truth for the visual identity of **AutoShopping** and its parent company **Autommerce**. Use this when building new pages, components, marketing material, or emails so everything stays on-brand.

---

## 1. Brand hierarchy & naming

| Level | Name | Usage |
|-------|------|-------|
| Company | **Autommerce** | Legal/company entity. Footer, "by Autommerce", invoices, domains. |
| Product (tool) | **AutoShopping** | The SaaS product itself. App title, dashboard, docs, in-app copy. |
| Tagline | **E-commerce with AI Excellence** | Marketing hero, footer, social. |

Rules:
- The tool is always written **AutoShopping** (one word, camel-case S).
- The company is **Autommerce** (double "m").
- When space allows, lock them up as **AutoShopping · by Autommerce** (see `Logo` `tool` variant).
- Never write "ShopAgent", "Auto Shopping", or "Automerce".

---

## 2. Color palette

Sourced from the official brand guide (`Final (1).pdf`).

### Primary
| Swatch | Hex | Token / usage |
|--------|-----|---------------|
| Orange | `#F76D01` | `--color-brand` / `--color-brand-orange` — primary brand color, CTAs, active states |
| Red | `#C40000` | `--color-brand-strong` / `--color-brand-red` — gradient end, emphasis |
| Deep Purple | `#400095` | `--color-brand-purple` / `--color-accent-to` — accent depth |

### Secondary
| Swatch | Hex | Token / usage |
|--------|-----|---------------|
| Purple | `#6B358D` | `--color-brand-purple-mid` / `--color-accent` / `--color-accent-from` — accent, wearable agent |
| Lavender | `#C8A8D2` | `--color-brand-lavender` — soft fills, subtle accents |
| Wine | `#79081D` | `--color-brand-wine` — deep accent, chart series |

### Signature gradient
The core brand gradient is **orange → red**:

```css
background: linear-gradient(135deg, #F76D01, #C40000);
/* utility class: .gradient-brand  (alias .gradient-autommerce) */
```

The **accent gradient** is purple:

```css
background: linear-gradient(135deg, #6B358D, #400095);
/* utility class: .gradient-accent */
```

### Agent color mapping
- **Shopping Assistant** (unwearable) → orange→red (`.gradient-unwearable`)
- **Virtual Try-On** (wearable) → purple (`.gradient-wearable`)

### Functional / status colors (kept distinct from brand)
| Purpose | Hex | Token |
|---------|-----|-------|
| Success | `#10B981` | `--color-success` |
| Warning | `#F59E0B` | `--color-warning` |
| Error / destructive | `#E11D48` | `--color-error` (intentionally different from brand red so destructive ≠ brand) |
| Info | `#3B82F6` | `--color-info` |

> All tokens are defined in [`src/styles/globals.css`](../src/styles/globals.css) under `@theme inline`, with a matching dark-mode block under `.dark`.

---

## 3. Typography

**Brand font: Uni Neue** — "Clean and Professional" rounded-geometric sans (weights Thin → Black). Commercial (Fontfabric); **not** on Google Fonts.

Current implementation (until licensed files are added):
- **Display / headings / wordmark** → **Poppins** (closest free match), exposed as `--font-display`.
- **Body / UI** → **Inter**, exposed as `--font-sans-body` (mapped to Tailwind `--font-sans`).
- **Mono** → Geist Mono (`--font-geist-mono`).

Wired in [`src/app/layout.tsx`](../src/app/layout.tsx).

### Swapping in the real Uni Neue later
1. Drop the licensed files into `src/fonts/` (e.g. `UniNeue-Regular.woff2`, `-Bold`, `-Heavy`).
2. In `layout.tsx`, replace the `Poppins(...)` call with `next/font/local` pointing at those files, keeping `variable: "--font-display"`.
3. No other change needed — every heading/wordmark already reads `var(--font-display)`.

Headings and the `.font-display` utility use the display font automatically (see `globals.css`).

---

## 4. Logo

### Component
`import { Logo, LogoMark } from "@/components/brand/logo"`

`<Logo />` props:
- `variant`: `"mark"` (symbol only) · `"full"` (symbol + "Autommerce") · `"tool"` (symbol + "AutoShopping" / "by Autommerce")
- `size`: mark height in px (wordmark scales relative to it)
- `inverted`: light wordmark text for dark backgrounds
- `className`, `markClassName`

`<LogoMark size={} />` renders just the SVG symbol (used for favicon, sidebar, tight spaces).

### The mark
A triangular **"A"** = two **orange** peaks + a **purple** arc + two **dark-red** feet. It is a hand-built inline SVG so it stays crisp at any size and recolors with the brand gradients. The favicon lives at [`src/app/icon.svg`](../src/app/icon.svg).

### Raster assets
Full-lockup PNGs (for emails, social, external docs) are in `public/brand/`:
- `autommerce-logo-light.png` — for light backgrounds
- `autommerce-logo-dark.png` — for dark backgrounds

### Do / Don't
- Do keep clear space around the mark equal to the height of one peak.
- Do use the light lockup on dark, dark lockup on light.
- Don't recolor the wordmark, stretch, rotate, or add shadows to the logo.
- Don't place the logo on a busy background without a solid/tinted container.

---

## 5. Design tokens reference

Defined in [`src/styles/globals.css`](../src/styles/globals.css).

### Radius
`--radius-sm 6px` · `--radius-md 10px` · `--radius-lg 16px` · `--radius-xl 20px` · `--radius-2xl 24px` · `--radius-full`

### Shadows
`--shadow-card` (resting) · `--shadow-elevated` (hover/raised) · `--shadow-modal` (overlays) · `--shadow-glow` (brand orange/red glow for primary CTAs)

### Surfaces & text
`--color-surface-base / -card / -elevated / -overlay`, `--color-border / -border-strong`, `--color-text-primary / -secondary / -muted / -inverse`. All have dark-mode values under `.dark`.

---

## 6. Utility classes (globals.css)

| Class | Purpose |
|-------|---------|
| `.gradient-brand` / `.gradient-autommerce` | orange→red fill |
| `.gradient-brand-warm` | 3-stop warm orange→red (hero/CTA panels) |
| `.gradient-accent` | purple fill |
| `.gradient-wearable` / `.gradient-unwearable` | agent gradients |
| `.gradient-text-brand` / `.gradient-text-accent` | gradient-clipped text |
| `.glow-brand` / `.glow-brand-hover` | brand glow shadow |
| `.gradient-border` | animated gradient border on hover |
| `.bg-mesh` / `.bg-mesh-strong` | brand radial mesh backgrounds |
| `.bg-dotgrid` | subtle dot grid (brand-guide style) |
| `.card-base` / `.card-elevated` / `.card-interactive` | card surfaces |
| `.font-display` | apply the display font to any element |
| `.animate-fade-in` / `-slide-right` / `-pulse-dot` / `-spin-slow` / `-float` / `-gradient` | motion helpers |

---

## 7. Component conventions

- **Buttons** ([`button.tsx`](../src/components/ui/button.tsx)): `primary` = brand gradient + glow + lift; `accent` = purple; `secondary`/`outline`/`ghost`/`danger` available.
- **Cards**: use `Card` with `interactive` for hoverable items, `elevated` for raised panels.
- **Badges / status**: `wearable` = purple, `unwearable` = orange; functional statuses use success/warning/error/info tokens.
- **Sidebar** ([`app-sidebar.tsx`](../src/components/layout/app-sidebar.tsx)): collapsible (persisted), animated active indicator (Framer Motion `layoutId`), Radix tooltips when collapsed, Radix dropdown account menu.
- Prefer CSS variable tokens (`var(--color-...)`) over hard-coded Tailwind color names so light/dark and future rebrands stay centralized. Charts (Recharts) use the brand hex values directly: orange `#F76D01`, purple `#6B358D`, plus wine/lavender for extra series.

---

## 8. Asset & file locations

| Asset | Path |
|-------|------|
| Design tokens & utilities | `src/styles/globals.css` |
| Fonts / metadata | `src/app/layout.tsx` |
| Logo component | `src/components/brand/logo.tsx` |
| Favicon | `src/app/icon.svg` |
| Raster logos | `public/brand/autommerce-logo-{light,dark}.png` |
| Brand color presets (in-app picker) | `src/features/settings/mocks/defaults.ts` → `BRAND_COLOR_PRESETS` |
| Brand guide (source) | `Final (1).pdf` |

---

## 9. Quick copy-paste palette

```
Orange       #F76D01
Red          #C40000
Deep Purple  #400095
Purple       #6B358D
Lavender     #C8A8D2
Wine         #79081D
```
