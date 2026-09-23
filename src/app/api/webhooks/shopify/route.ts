import { indexProductIfInScope } from "@/lib/catalog/index-product";
import { markAcsProductOutOfStock } from "@/lib/catalog/acs/sync";
import { getStoreConnectionByStoreUrl } from "@/lib/db/store-connections";
import { applyShopifyOrderTopic } from "@/lib/attribution/apply-shopify-order";
import { mapShopifyWebhookProduct, normalizeShopifyDomain, ORDER_WEBHOOK_TOPICS } from "@/lib/shopify/client";
import { decodeCredentials } from "@/lib/utils/crypto";
import { verifyHmacSignature } from "@/lib/utils/internal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Product create/update/delete from a merchant's Shopify store.
 *
 * The signature is checked against the **raw body text**, before any parsing. Verifying a
 * re-serialised object instead is the classic way to break this: `JSON.parse` followed by
 * `JSON.stringify` reorders keys and drops whitespace, so the bytes no longer match what
 * Shopify signed and every legitimate delivery fails.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  const shopDomain = request.headers.get("x-shopify-shop-domain");
  const topic = request.headers.get("x-shopify-topic") ?? "";
  const signature = request.headers.get("x-shopify-hmac-sha256");

  if (!shopDomain) {
    return Response.json({ error: "Missing shop domain" }, { status: 400 });
  }

  const connection = await getStoreConnectionByStoreUrl(shopDomain);
  if (!connection?.apiKeyEncrypted) {
    // A 200 on purpose. Shopify retries non-2xx for days, and a webhook for a store that is
    // no longer connected here will never start succeeding.
    return Response.json({ ignored: "unknown store" });
  }

  // Webhooks registered through the Admin API are signed with the app's own client secret,
  // which is already stored as part of the connection's credentials.
  const { clientSecret } = decodeCredentials(connection.apiKeyEncrypted);
  if (!clientSecret || !verifyHmacSignature(rawBody, signature, clientSecret)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if ((ORDER_WEBHOOK_TOPICS as readonly string[]).includes(topic)) {
      await applyShopifyOrderTopic(connection, topic, payload);
      return Response.json({ ok: true });
    }

    if (topic === "products/delete") {
      const id = (payload as { id?: number }).id;
      // Downgraded rather than removed — Google's own guidance is that deleting an ACS product
      // invalidates the user-event history tied to its id (see `markAcsProductOutOfStock`).
      if (id) await markAcsProductOutOfStock(connection.id, `gid://shopify/Product/${id}`);
      return Response.json({ deleted: true });
    }

    const product = mapShopifyWebhookProduct(payload, normalizeShopifyDomain(connection.storeUrl));
    if (!product) return Response.json({ ignored: "unmappable payload" });

    const outcome = await indexProductIfInScope(connection, product);
    return Response.json({ outcome });
  } catch (err) {
    console.error("[webhooks/shopify]", err);
    // 500 so Shopify retries — a transient Gemini failure should not silently drop the update.
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
