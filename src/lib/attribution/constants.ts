/** How long after Persona adds an item that add still counts toward the order. */
export const ATTRIBUTION_WINDOW_DAYS = 7;

/**
 * Cart line property written by the widget. The leading underscore hides it from the shopper
 * in Shopify's cart and checkout; the order webhook still receives it.
 */
export const PERSONA_LINE_PROPERTY = "_persona";

export function attributionWindowStart(orderIso: string, days = ATTRIBUTION_WINDOW_DAYS): string {
  const at = Date.parse(orderIso);
  const from = Number.isFinite(at) ? at : Date.now();
  return new Date(from - days * 24 * 60 * 60 * 1000).toISOString();
}
