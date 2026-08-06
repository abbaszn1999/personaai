/** Passed only when a hook is powering the public, no-login `/embed/[token]` page or
 *  widget.js — swaps every `/api/agents/*` call for its public `/api/embed/*` counterpart and
 *  includes the embed token (plus a per-shopper session id) on every request. Shared by the
 *  wearable (try-on) and unwearable (shopping assistant) agent hooks. */
export interface EmbedRuntimeConfig {
  apiBase: string;
  embedToken: string;
  /** Only true for the real `widget.js` snippet running on the merchant's own site — where
   *  "add to cart" can mutate the shopper's real store cart (WooCommerce Store API or
   *  Shopify Ajax `/cart/add.js`). Dashboard / `/embed/[token]` previews leave this off. */
  enableRealCart?: boolean;
}
