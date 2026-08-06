/**
 * Browser-only client for adding items to a shopper's real Shopify cart.
 *
 * Same constraints as the WooCommerce Store API client: this must run in the shopper's
 * browser on the merchant's own storefront origin so the request carries their cart cookie/
 * session. `widget.js` on a Shopify theme page has that context (it mounts into the host page
 * via a shadow-DOM host, not an iframe — see widget/src/main.tsx — so `window.Shopify` on the
 * host page is directly reachable); our dashboard preview does not.
 *
 * Prefers Shopify's Standard Storefront Action (`window.Shopify.actions.updateCart`, shipped
 * platform-wide in the June 2026 Spring '26 Edition) over the classic Ajax `/cart/add.js`
 * endpoint, since the standard action is the only theme-agnostic way to get the merchant's own
 * cart icon/drawer/page to reflect the change without the shopper reloading the page — see
 * https://shopify.dev/docs/storefronts/themes/best-practices/standard-actions. The classic
 * endpoint is kept only as a defensive fallback for stores where that action isn't available.
 */

const LOG_PREFIX = "[shopify-cart]";

interface AddToCartResult {
  ok: boolean;
  error?: string;
}

interface ShopifyAjaxErrorBody {
  description?: string;
  message?: string;
  status?: number;
}

/** Minimal ambient shape of the Standard Storefront Action surface Shopify injects on every
 *  Liquid storefront (`window.Shopify.actions`) — see the module doc comment above for the
 *  spec this mirrors. Only the pieces this client actually calls are declared. */
interface ShopifyCartUserError {
  message?: string;
  code?: string;
}

interface ShopifyUpdateCartResult {
  cart?: unknown;
  userErrors?: ShopifyCartUserError[];
  warnings?: ShopifyCartUserError[];
}

interface ShopifyStandardActions {
  updateCart?: (payload: {
    lines: Array<{ merchandiseId: string; quantity: number }>;
  }) => Promise<ShopifyUpdateCartResult>;
}

/** Shopify error code for its cart-mutation throttle — hit disproportionately on the very
 *  first mutation of a session, since a shopper with no cart cookie yet implicitly triggers a
 *  `cartCreate` under the hood, which carries extra rate-limit safeguards beyond normal
 *  cart-line updates. See https://community.shopify.com/t/561777. */
const THROTTLED_ERROR_CODE = "THROTTLED";

declare global {
  interface Window {
    Shopify?: {
      actions?: ShopifyStandardActions;
    };
  }
}

/** Ask common Shopify themes to refresh the cart drawer / badge after we mutate the cart via
 *  the classic endpoint — only relevant to the fallback path below; the standard action already
 *  auto-emits the proper `shopify:cart:lines-update` event itself on success. */
function notifyThemeCartUpdated() {
  try {
    document.documentElement.dispatchEvent(new CustomEvent("cart:refresh"));
    document.documentElement.dispatchEvent(new CustomEvent("cart:updated"));
    document.dispatchEvent(new CustomEvent("cart:refresh"));
    document.dispatchEvent(new CustomEvent("cart:updated"));
  } catch {
    // Non-fatal — the item is still in the cart even if the drawer doesn't auto-redraw.
  }
}

/** Adds one variant to the shopper's real cart via the classic Ajax `/cart/add.js` endpoint.
 *  Used only when the Standard Storefront Action isn't available on this storefront. */
async function addItemViaLegacyAjaxCart(
  origin: string,
  variantId: number,
  quantity: number
): Promise<AddToCartResult> {
  const url = `${origin.replace(/\/+$/, "")}/cart/add.js`;
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ id: variantId, quantity }),
    });

    console.debug(`${LOG_PREFIX} POST add.js id=${variantId} ->`, res.status);

    const rawText = await res.text();
    let body: ShopifyAjaxErrorBody = {};
    try {
      body = JSON.parse(rawText);
    } catch {
      // Not JSON — likely an HTML error / password page.
    }

    if (!res.ok) {
      console.error(`${LOG_PREFIX} add.js failed`, {
        status: res.status,
        message: body.description || body.message,
        rawText: rawText.slice(0, 500),
      });
      const detail =
        body.description ||
        body.message ||
        (res.status ? `store returned ${res.status}` : "unknown error");
      return { ok: false, error: `Couldn't add this to your cart — ${detail}` };
    }

    notifyThemeCartUpdated();
    return { ok: true };
  } catch (err) {
    console.error(`${LOG_PREFIX} network error calling ${url}`, err);
    return { ok: false, error: "Couldn't reach the store to add this to your cart — check your connection." };
  }
}

/** Adds one variant to the shopper's real cart via Shopify's Standard Storefront Action. Its
 *  default handler writes through the Storefront API, attempts an in-place theme refresh (works
 *  out of the box for Dawn-/Horizon-based themes), and falls back to a full page reload only if
 *  neither pattern matches — so the shopper always sees the update without us writing any
 *  per-theme code.
 *
 *  Retries internally, with backoff, specifically on Shopify's `THROTTLED` cart-mutation error —
 *  this hits disproportionately on the very first mutation of a session (implicit `cartCreate`
 *  carries extra safeguards Shopify doesn't document publicly), so a shopper's very first "Add to
 *  Cart"/"Add All" click would otherwise reliably fail once and need a second, separate click. */
async function addItemViaStandardAction(
  updateCart: NonNullable<ShopifyStandardActions["updateCart"]>,
  variantId: number,
  quantity: number
): Promise<AddToCartResult> {
  const merchandiseId = `gid://shopify/ProductVariant/${variantId}`;
  const backoffMs = [400, 900, 1500];
  let lastMessage = "Couldn't add this to your cart.";

  for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
    try {
      const result = await updateCart({
        lines: [{ merchandiseId, quantity }],
      });

      if (result.userErrors && result.userErrors.length > 0) {
        const firstError = result.userErrors[0];
        lastMessage = firstError?.message || "Couldn't add this to your cart.";
        if (firstError?.code === THROTTLED_ERROR_CODE && attempt < backoffMs.length) {
          console.warn(`${LOG_PREFIX} Shopify.actions.updateCart throttled, retrying in ${backoffMs[attempt]}ms`);
          await new Promise((resolve) => setTimeout(resolve, backoffMs[attempt]));
          continue;
        }
        console.error(`${LOG_PREFIX} Shopify.actions.updateCart rejected`, result.userErrors);
        return { ok: false, error: lastMessage };
      }

      console.debug(`${LOG_PREFIX} Shopify.actions.updateCart id=${variantId} -> ok`);
      return { ok: true };
    } catch (err) {
      console.error(`${LOG_PREFIX} Shopify.actions.updateCart threw`, err);
      return { ok: false, error: "Couldn't add this to your cart — please try again." };
    }
  }

  return { ok: false, error: lastMessage };
}

/**
 * Adds one variant to the shopper's real Shopify cart, preferring the Standard Storefront
 * Action and falling back to the classic Ajax endpoint only when that action is entirely
 * unavailable (e.g. a pre-rollout store, a headless/non-Liquid storefront, or the action script
 * hasn't loaded yet). If the action is available but the mutation itself fails (rejects, or
 * resolves with `userErrors`), that failure is surfaced as-is rather than silently retried via
 * the legacy endpoint, since retrying risks adding the item twice.
 */
export async function addItemToShopifyCart(
  origin: string,
  variantId: number,
  quantity = 1
): Promise<AddToCartResult> {
  const updateCart = typeof window !== "undefined" ? window.Shopify?.actions?.updateCart : undefined;
  if (updateCart) {
    return addItemViaStandardAction(updateCart, variantId, quantity);
  }
  return addItemViaLegacyAjaxCart(origin, variantId, quantity);
}
