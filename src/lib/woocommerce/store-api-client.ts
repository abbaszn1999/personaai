/**
 * Browser-only client for WooCommerce's public Store API (`/wp-json/wc/store/v1/*`).
 *
 * This is deliberately never called from our own server: a WooCommerce cart is tied to the
 * *shopper's own browser session* (cookies), so the only way to actually add something to the
 * real cart the shopper will see at checkout is to make this request directly from their
 * browser. Since `widget.js` runs inside the merchant's own page, `window.location.origin`
 * there *is* the merchant's WooCommerce site — so this is a same-origin call with no CORS or
 * credential-sharing concerns.
 *
 * Important: we deliberately do NOT send the Store API's `Cart-Token` header. That token is
 * for headless/SPA carts and creates a separate cart session from the cookie-based cart the
 * theme's "Shopping cart" drawer reads. Sending it made add-item return 201 while the visible
 * cart stayed empty / missing items. Same-origin + `credentials: "include"` + Nonce is enough.
 *
 * Not used by the dashboard's own preview/testing pages — those run on this app's own domain,
 * so there is no real shopper cart to add anything to there.
 */

const LOG_PREFIX = "[woo-cart]";

interface CartSession {
  origin: string;
  nonce: string | null;
}

let session: CartSession | null = null;

function readNonce(res: Response, origin: string) {
  const nonce = res.headers.get("Nonce") ?? res.headers.get("X-WC-Store-API-Nonce");
  session = {
    origin,
    nonce: nonce ?? session?.nonce ?? null,
  };
  console.debug(`${LOG_PREFIX} session headers`, {
    origin,
    status: res.status,
    gotNonce: !!nonce,
  });
}

async function refreshSession(origin: string): Promise<void> {
  const url = `${origin}/wp-json/wc/store/v1/cart`;
  try {
    const res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    readNonce(res, origin);
    if (!res.ok) {
      console.warn(`${LOG_PREFIX} GET ${url} returned ${res.status} — the store may not have the Store API enabled/reachable.`);
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} couldn't reach ${url}`, err);
  }
}

interface AddToCartResult {
  ok: boolean;
  error?: string;
  /** Item ids currently in the Store API cart after a successful add (for debugging). */
  cartItemIds?: number[];
}

interface WooStoreApiErrorBody {
  message?: string;
  code?: string;
}

interface WooStoreCartBody {
  items?: Array<{ id?: number; name?: string; quantity?: number }>;
}

/** Ask the theme to refresh its cart drawer / badge after we mutate the cookie cart. */
function notifyThemeCartUpdated() {
  try {
    // Standard WooCommerce fragments refresh (classic themes / cart widget).
    document.body.dispatchEvent(new Event("wc_fragment_refresh"));
    // Block-based / Store API themes sometimes listen for this.
    document.body.dispatchEvent(new CustomEvent("wc-blocks_added_to_cart"));
  } catch {
    // Non-fatal — the item is still in the cart even if the drawer doesn't auto-redraw.
  }
}

/** Adds one item (a plain product id, or a specific variation id resolved server-side for
 *  products with size/color options) to the real shopper's WooCommerce cart. */
export async function addItemToWooCommerceCart(
  origin: string,
  itemId: number,
  quantity = 1
): Promise<AddToCartResult> {
  const url = `${origin}/wp-json/wc/store/v1/cart/add-item`;
  try {
    if (!session || session.origin !== origin || !session.nonce) {
      await refreshSession(origin);
    }

    const post = () =>
      fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          // Cookie session only — never Cart-Token (see file header comment).
          ...(session?.nonce ? { Nonce: session.nonce } : {}),
        },
        body: JSON.stringify({ id: itemId, quantity }),
      });

    let res = await post();
    console.debug(`${LOG_PREFIX} POST add-item id=${itemId} ->`, res.status);

    // A 401/403 here almost always means a stale/missing nonce — refresh once and retry
    // before giving up, rather than surfacing a spurious failure on the shopper's first click.
    if (res.status === 401 || res.status === 403) {
      await refreshSession(origin);
      res = await post();
      console.debug(`${LOG_PREFIX} retried POST add-item id=${itemId} ->`, res.status);
    }

    readNonce(res, origin);

    const rawText = await res.text();
    let body: WooStoreApiErrorBody & WooStoreCartBody = {};
    try {
      body = JSON.parse(rawText);
    } catch {
      // Not JSON — likely an HTML error page from a security/caching plugin.
    }

    if (!res.ok) {
      console.error(`${LOG_PREFIX} add-item failed`, {
        status: res.status,
        code: body.code,
        message: body.message,
        rawText: rawText.slice(0, 500),
      });
      const detail =
        body.message ||
        (res.status ? `store returned ${res.status}${body.code ? ` (${body.code})` : ""}` : "unknown error");
      return { ok: false, error: `Couldn't add this to your cart — ${detail}` };
    }

    const cartItemIds = (body.items ?? [])
      .map((item) => item.id)
      .filter((id): id is number => typeof id === "number");
    console.debug(`${LOG_PREFIX} cart now has ${cartItemIds.length} item(s)`, {
      addedId: itemId,
      cartItemIds,
      names: (body.items ?? []).map((item) => item.name),
    });

    notifyThemeCartUpdated();
    return { ok: true, cartItemIds };
  } catch (err) {
    console.error(`${LOG_PREFIX} network error calling ${url}`, err);
    return { ok: false, error: "Couldn't reach the store to add this to your cart — check your connection." };
  }
}
