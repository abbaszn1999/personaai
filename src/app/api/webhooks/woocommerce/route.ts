import { indexProductIfInScope } from "@/lib/catalog/index-product";
import { markAcsProductOutOfStock } from "@/lib/catalog/acs/sync";
import { getStoreConnectionByStoreUrl } from "@/lib/db/store-connections";
import { mapWooWebhookProduct } from "@/lib/woocommerce/client";
import { deriveWebhookSecret, verifyHmacSignature } from "@/lib/utils/internal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Product create/update/delete from a merchant's WooCommerce store.
 *
 * Same rule as the Shopify route: the signature is verified against the raw body text before
 * parsing, because re-serialising the payload changes the bytes that were signed.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  const source = request.headers.get("x-wc-webhook-source");
  const topic = request.headers.get("x-wc-webhook-topic") ?? "";
  const signature = request.headers.get("x-wc-webhook-signature");

  if (!source) {
    return Response.json({ error: "Missing webhook source" }, { status: 400 });
  }

  const connection = await getStoreConnectionByStoreUrl(source);
  if (!connection) {
    return Response.json({ ignored: "unknown store" });
  }

  if (!verifyHmacSignature(rawBody, signature, deriveWebhookSecret(connection.id))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (topic === "product.deleted") {
      const id = (payload as { id?: number }).id;
      // Downgraded rather than removed — see the Shopify webhook route's identical note.
      if (id) await markAcsProductOutOfStock(connection.id, String(id));
      return Response.json({ deleted: true });
    }

    const product = mapWooWebhookProduct(payload);
    if (!product) return Response.json({ ignored: "unmappable payload" });

    const outcome = await indexProductIfInScope(connection, product);
    return Response.json({ outcome });
  } catch (err) {
    console.error("[webhooks/woocommerce]", err);
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
