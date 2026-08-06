import { NextRequest } from "next/server";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { decodeCredentials } from "@/lib/utils/crypto";
import { resolveAddToCartItemId, normalizeWordPressUrl, WooCommerceApiError } from "@/lib/woocommerce/client";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedJson, embedOptions } from "@/lib/embed/cors";

interface RequestBody {
  embedToken?: string;
  productId?: string;
}

export async function OPTIONS() {
  return embedOptions();
}

/**
 * @deprecated Prefer `/api/embed/cart-item`, which also supports Shopify. Kept so older
 *  widget bundles that still hit this path keep working for WordPress stores.
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
    if (
      !connection ||
      connection.status !== "connected" ||
      !connection.apiKeyEncrypted ||
      (connection.platform !== "woocommerce" && connection.platform !== "wordpress")
    ) {
      return embedJson({ error: "This store isn't connected to a WooCommerce catalog." }, { status: 400 });
    }

    const { wpUsername, wpAppPassword } = decodeCredentials(connection.apiKeyEncrypted);
    const siteUrl = normalizeWordPressUrl(connection.storeUrl);

    const id = await resolveAddToCartItemId(siteUrl, wpUsername, wpAppPassword, productId);

    return embedJson({ id, platform: "wordpress" as const });
  } catch (err) {
    if (err instanceof WooCommerceApiError) {
      return embedJson({ error: err.message }, { status: err.status ?? 502 });
    }
    console.error("[api/embed/woocommerce/cart-item POST]", err);
    return embedJson({ error: "Couldn't reach the store to add this item." }, { status: 502 });
  }
}
