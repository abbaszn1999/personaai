import { indexProductIfInScope } from "@/lib/catalog/index-product";
import { createCatalogPager } from "@/lib/catalog/pager";
import { applyWooOrder } from "@/lib/attribution/apply-woo-order";
import { markAcsProductOutOfStock } from "@/lib/catalog/acs/sync";
import { getStoreConnectionsByStoreUrl } from "@/lib/db/store-connections";
import { markPathConfigStale } from "@/lib/catalog/path-config/rebuild";
import { noteStoreProductChanged } from "@/lib/catalog/catalog-change";
import { mapWooWebhookProduct } from "@/lib/woocommerce/client";
import { markSyncProductsRemoved } from "@/lib/db/sync-new-products";
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

  const candidates = await getStoreConnectionsByStoreUrl(source);
  if (candidates.length === 0) {
    return Response.json({ ignored: "unknown store" });
  }

  const connection = candidates.find((row) => verifyHmacSignature(rawBody, signature, deriveWebhookSecret(row.id)));
  if (!connection) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (topic === "order.created" || topic === "order.updated") {
      await applyWooOrder(connection, payload);
      return Response.json({ handled: topic });
    }
    // A deleted order is no evidence about a sale already recorded, so it is acknowledged and left.
    if (topic.startsWith("order.")) {
      return Response.json({ ignored: topic });
    }

    if (topic === "product.deleted") {
      const id = (payload as { id?: number }).id;
      // Downgraded rather than removed — see the Shopify webhook route's identical note.
      if (id) {
        await markSyncProductsRemoved(connection.id, [String(id)]);
        await markAcsProductOutOfStock(connection.id, String(id));
        noteStoreProductChanged(connection.id, String(id));
      }
      await markPathConfigStale(connection.id);
      return Response.json({ deleted: true });
    }

    // A sale or stock edit on one size/colour arrives as a bare variation object (no categories,
    // no short description), so the parent product is refetched and indexed in its place.
    const parentId = (payload as { parent_id?: number }).parent_id;
    const product = parentId
      ? (await (await createCatalogPager(connection))?.fetchByIds([String(parentId)]))?.[0] ?? null
      : mapWooWebhookProduct(payload, connection.storeCurrency);
    if (!product) return Response.json({ ignored: "unmappable payload" });

    noteStoreProductChanged(connection.id, product.externalId);
    const outcome = await indexProductIfInScope(connection, product);
    await markPathConfigStale(connection.id);
    return Response.json({ outcome });
  } catch (err) {
    console.error("[webhooks/woocommerce]", err);
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
