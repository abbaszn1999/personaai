import { NextRequest } from "next/server";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { decodeCredentials } from "@/lib/utils/crypto";
import {
  resolveAddToCartItemId,
  normalizeWordPressUrl,
  WooCommerceApiError,
} from "@/lib/woocommerce/client";
import {
  bareShopifyId,
  getShopifyAccessToken,
  normalizeShopifyDomain,
  resolveShopifyCartVariantId,
  ShopifyApiError,
} from "@/lib/shopify/client";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedJson, embedOptions } from "@/lib/embed/cors";

interface RequestBody {
  embedToken?: string;
  productId?: string;
  /** Shopify only — the specific variant GID the shopper picked (e.g. size/color). When
   *  omitted, falls back to auto-picking the first in-stock variant (unchanged behavior,
   *  and the only path for WooCommerce and bulk "Add All to Cart" adds). */
  variantId?: string;
}

export async function OPTIONS() {
  return embedOptions();
}

/**
 * Resolves the numeric id the shopper's browser should send to the store's native cart API
 * (Woo Store API item id, or Shopify Ajax `/cart/add.js` variant id). Platform is returned so
 * the widget can call the matching browser-side cart client. Admin credentials never leave
 * the server — the cart mutation itself still happens in the shopper's browser.
 */
export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json().catch(() => ({}));

    const resolution = await resolveEmbedRequest(body.embedToken);
    if ("error" in resolution) return resolution.error;
    const { workspace } = resolution;

    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    if (!productId) {
      return embedJson({ error: "Missing product id" }, { status: 400 });
    }

    const connection = await getStoreConnectionByOwner(workspace.ownerId);
    if (!connection || connection.status !== "connected" || !connection.apiKeyEncrypted) {
      return embedJson({ error: "No store is connected for this workspace." }, { status: 400 });
    }

    if (connection.platform === "shopify") {
      const { clientId, clientSecret } = decodeCredentials(connection.apiKeyEncrypted);
      if (!clientId || !clientSecret) {
        return embedJson({ error: "Shopify credentials are incomplete." }, { status: 400 });
      }
      const domain = normalizeShopifyDomain(connection.storeUrl);
      const explicitVariantId =
        typeof body.variantId === "string" && body.variantId.trim()
          ? Number(bareShopifyId(body.variantId.trim()))
          : NaN;
      if (Number.isFinite(explicitVariantId) && explicitVariantId > 0) {
        return embedJson({ platform: "shopify" as const, id: explicitVariantId });
      }
      const token = await getShopifyAccessToken(domain, clientId, clientSecret, connection.id);
      const id = await resolveShopifyCartVariantId(domain, token, productId);
      return embedJson({ platform: "shopify" as const, id });
    }

    if (connection.platform === "wordpress" || connection.platform === "woocommerce") {
      const { wpUsername, wpAppPassword } = decodeCredentials(connection.apiKeyEncrypted);
      if (!wpUsername || !wpAppPassword) {
        return embedJson({ error: "WordPress credentials are incomplete." }, { status: 400 });
      }
      const siteUrl = normalizeWordPressUrl(connection.storeUrl);
      const id = await resolveAddToCartItemId(siteUrl, wpUsername, wpAppPassword, productId);
      return embedJson({ platform: "wordpress" as const, id });
    }

    return embedJson(
      { error: "Add to cart isn't supported for this store platform yet." },
      { status: 400 }
    );
  } catch (err) {
    if (err instanceof WooCommerceApiError) {
      return embedJson({ error: err.message }, { status: err.status ?? 502 });
    }
    if (err instanceof ShopifyApiError) {
      return embedJson({ error: err.message }, { status: err.status ?? 502 });
    }
    console.error("[api/embed/cart-item POST]", err);
    return embedJson({ error: "Couldn't reach the store to add this item." }, { status: 502 });
  }
}
