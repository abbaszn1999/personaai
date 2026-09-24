import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner, setStoreOrdersAccess } from "@/lib/db/store-connections";
import { decodeCredentials } from "@/lib/utils/crypto";
import { deriveWebhookSecret } from "@/lib/utils/internal-auth";
import { isPublicCallback } from "@/lib/utils/public-url";
import { getShopifyAccessToken, normalizeShopifyDomain, registerShopifyWebhooks, ShopifyApiError } from "@/lib/shopify/client";
import { normalizeWordPressUrl, registerWooWebhooks, WooCommerceApiError } from "@/lib/woocommerce/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Re-registers order webhooks and refreshes the Shopify token, so a merchant who added
 * `read_orders` after connecting can turn GMV tracking on without reconnecting the store.
 */
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const row = await getStoreConnectionByOwner(user.id);
    if (!row?.apiKeyEncrypted) {
      return Response.json({ error: "No store is connected" }, { status: 400 });
    }

    const appUrl = process.env.APP_URL;
    if (!appUrl) return Response.json({ error: "APP_URL is not configured" }, { status: 500 });
    const callbackBase = appUrl.replace(/\/+$/, "");
    if (!isPublicCallback(callbackBase)) {
      return Response.json(
        { error: "Order tracking can only be turned on from the live site. Your store can't send orders to a local address." },
        { status: 400 }
      );
    }

    if (row.platform === "shopify") {
      const { clientId, clientSecret } = decodeCredentials(row.apiKeyEncrypted);
      if (!clientId || !clientSecret) {
        return Response.json({ error: "Shopify credentials are incomplete" }, { status: 400 });
      }
      const domain = normalizeShopifyDomain(row.storeUrl);
      const token = await getShopifyAccessToken(domain, clientId, clientSecret, row.id, true);
      const result = await registerShopifyWebhooks(domain, token, `${callbackBase}/api/webhooks/shopify`);
      await setStoreOrdersAccess(row.id, result.ordersAccess);
      return Response.json({ ordersAccess: result.ordersAccess, registered: result.registered, failed: result.failed });
    }

    if (row.platform === "wordpress" || row.platform === "woocommerce") {
      const { wpUsername, wpAppPassword } = decodeCredentials(row.apiKeyEncrypted);
      if (!wpUsername || !wpAppPassword) {
        return Response.json({ error: "WordPress credentials are incomplete" }, { status: 400 });
      }
      const result = await registerWooWebhooks(
        normalizeWordPressUrl(row.storeUrl),
        wpUsername,
        wpAppPassword,
        `${callbackBase}/api/webhooks/woocommerce`,
        deriveWebhookSecret(row.id)
      );
      await setStoreOrdersAccess(row.id, result.ordersAccess);
      return Response.json({ ordersAccess: result.ordersAccess, registered: result.registered, failed: result.failed });
    }

    return Response.json({ error: "This store does not support order tracking" }, { status: 400 });
  } catch (err) {
    if (err instanceof ShopifyApiError || err instanceof WooCommerceApiError) {
      return Response.json({ error: err.message }, { status: 502 });
    }
    console.error("[store-connection/order-access POST]", err);
    return Response.json({ error: "Could not reach your store. Try again in a minute." }, { status: 502 });
  }
}
