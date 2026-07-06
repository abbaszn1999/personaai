# ShopAgent — Architecture & Integration Documentation

## Overview

ShopAgent is a SaaS platform with two distinct audiences:

- **Client** — the e-commerce store owner who pays for ShopAgent and manages workspaces via the dashboard
- **Shopper** — the end-user on the client's website who interacts with the Try-On Agent or Shopping Assistant

The dashboard (`/dashboard`) is the client's control panel. The widget is what shoppers see on the client's website. These are two completely separate surfaces.

---

## Widget Embedding Architecture

### Approach: JavaScript Snippet

Clients embed ShopAgent on their website with a single script tag:

```html
<script src="https://yourdomain.com/widget.js?workspace=ws-123" async></script>
```

This is the industry-standard approach used by Intercom, Crisp, Zendesk, Drift, and Hotjar. It is the correct foundation for a serious SaaS product.

### Why NOT iFrame (and why JS Snippet is better)

| Capability | iFrame | JS Snippet |
|---|---|---|
| Works on all platforms (Shopify, WP, custom) | Yes | Yes |
| Access client's cart DOM directly | No | Yes |
| Know what product page the shopper is on | No | Yes |
| Floating button + full-page mode | Hard | Easy |
| Mobile responsive (native feel) | Hard | Easy |
| Pass shopper login data from client site | Painful | Simple |
| No cross-origin limitations | No | Yes |
| Future Shopify/WP native plugin integration | Separate build | Builds on same foundation |

iFrame is blocked from cross-origin communication by default — meaning it cannot access the client's cart, cannot read the current product page, and cannot interact with the client's existing session. It is suitable for demos only, not as a product foundation.

---

## How the JavaScript Snippet Works

### The Loader Script (`widget.js`)

`widget.js` is a small (~50 lines) bootstrapper. It does the following when loaded on the client's page:

1. Reads the `workspace` query parameter from the script tag URL
2. Injects a launcher button (e.g. bottom-right corner) into the client's page DOM
3. On button click, creates a panel/container div and loads `/embed/[workspaceId]` inside it
4. Runs in the **same page context** as the client's website, giving full access to the DOM

Because it runs in the same page context (not an iframe), it can:
- Read `window.location.href` to know which product page the shopper is on
- Call `window.Shopify.cart` or WooCommerce cart functions directly
- Access the client's existing shopper session/cookies
- Pass shopper login information if the client's site has user accounts

### The Embed Page (`/embed/[workspaceId]`)

A standalone Next.js route with no dashboard chrome (no sidebar, no header). It renders either the Try-On Agent or Shopping Assistant depending on the workspace mode. This page is loaded inside the panel injected by `widget.js`.

### App Route Architecture

```
src/app/
├── (dashboard)/          →  client-facing admin panel (workspace owner only)
│   ├── workspaces/
│   ├── store/
│   └── settings/
├── embed/
│   └── [workspaceId]/    →  standalone widget UI (shopper-facing, no chrome)
│       └── page.tsx
└── widget.js             →  loader script (or served via public/ or a Next.js API route)
```

---

## Widget Display Modes

Clients can choose how the widget appears on their site (configurable per workspace in settings):

### Floating Launcher (recommended for Shopping Assistant)
- A button fixed to the bottom-right corner of every page
- On click, a slide-in panel opens with the assistant
- Always accessible, doesn't interrupt the shopping flow
- Best for the AI Shopping Assistant (unwearable workspace)

### Full-Page Embed (recommended for Virtual Try-On)
- Client places the script tag on a dedicated page (e.g. `/try-on`)
- The widget renders as a full-width, full-height section
- Best for the Virtual Try-On (wearable workspace) which needs more screen space
- Client links to this page from product pages ("Try this on →")

Both modes are served by the same `/embed/[workspaceId]` page — the display mode is a parameter passed to `widget.js`.

---

## Add to Cart Integration

### How It Works

Because `widget.js` runs in the same page context as the client's website, it can call the store's native cart functions directly.

### Shopify

```javascript
// Shopify exposes a global fetch-based cart API
fetch('/cart/add.js', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: variantId,      // Shopify variant ID
    quantity: 1
  })
});
```

No API key needed — this runs as the shopper's own browser session on the Shopify store domain.

### WooCommerce

```javascript
// WooCommerce REST API (requires nonce passed from the page)
fetch('/wp-json/wc/store/cart/add-item', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-WC-Store-API-Nonce': window.wcStoreApiNonce  // injected by WP into page
  },
  body: JSON.stringify({
    id: productId,
    quantity: 1
  })
});
```

### Custom / Headless Stores

For custom stores, the client provides a `cartEndpoint` in their workspace connection settings. ShopAgent calls it with a standard payload:

```json
{
  "productId": "p-w-001",
  "variantId": "v-001-m",
  "quantity": 1,
  "shopperSessionId": "sess-abc123"
}
```

### Cart Communication Flow (widget.js ↔ embed page)

Since the embed page is loaded inside a container created by `widget.js`, they can communicate via `postMessage`:

```
Shopper clicks "Add to Cart" inside /embed/[workspaceId]
  → embed page sends postMessage({ type: "ADD_TO_CART", payload: { productId, variantId } })
  → widget.js (running in the parent page) receives the message
  → widget.js calls the appropriate store cart API (Shopify / WooCommerce / custom)
  → widget.js sends back postMessage({ type: "CART_SUCCESS" })
  → embed page shows confirmation to shopper
```

This pattern keeps the cart logic in `widget.js` (which has full page context) while the UI stays in the embed page.

---

## Per-Shopper Data

Each shopper on the client's website has their own isolated data:

| Data | Storage | Notes |
|---|---|---|
| Body profile (height, weight, shape) | Server-side, keyed to session ID | Persisted across visits |
| Chat history | Server-side, keyed to session ID | Per workspace |
| Outfit selections | Server-side, keyed to session ID | Cleared after try-on or purchase |
| Cart state | Client's store (not ShopAgent) | ShopAgent only triggers add-to-cart |

### Shopper Session ID

Shoppers are identified by an anonymous session token:

1. First visit: `widget.js` generates a UUID and stores it in `localStorage` under the key `shopagent_session`
2. Subsequent visits: the same token is read from `localStorage`
3. If the client's site has user accounts and passes a `userId` to the script tag, that is used instead for cross-device persistence

```html
<!-- Anonymous (default) -->
<script src="https://yourdomain.com/widget.js?workspace=ws-123" async></script>

<!-- Authenticated shopper (client passes their user ID) -->
<script src="https://yourdomain.com/widget.js?workspace=ws-123&userId=usr-456" async></script>
```

---

## Dashboard Additions Required

The following additions are needed on the dashboard side to support the embed workflow:

### 1. Embed Code Panel (in Workspace Settings)
- Shows the `<script>` snippet for the workspace, pre-filled with the workspace ID
- One-click copy button
- Display mode toggle (floating / full-page)
- "Preview as Customer" button — opens `/embed/[workspaceId]` in a new tab

### 2. Workspace Status Indicator
- Shows whether the embed is active/live
- Shows shopper session count (when backend exists)

---

## Phased Implementation Plan

### Phase 1 — Prototype / MVP
- [ ] Build `/embed/[workspaceId]` — standalone widget page, no dashboard chrome
- [ ] Add "Embed Code" section to workspace settings
- [ ] Add "Preview as Customer" button
- [ ] Mock shopper sessions and mock Add to Cart action

### Phase 2 — Real Product
- [ ] Build `widget.js` loader script
- [ ] Implement anonymous shopper sessions (localStorage token + server-side storage)
- [ ] Implement Add to Cart for Shopify (fetch `/cart/add.js`)
- [ ] Implement Add to Cart for WooCommerce (WC Store API)
- [ ] `postMessage` bridge between embed page and widget.js

### Phase 3 — Platform Native (optional)
- [ ] WordPress plugin with `[shopagent]` shortcode
- [ ] Shopify App embed block (Shopify App Store submission)
- [ ] Deeper cart and product page context integration per platform

---

*Last updated: July 2026*
