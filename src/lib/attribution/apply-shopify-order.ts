import { hasSuccessfulCartAdd } from "@/lib/db/cart-events";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { attributionWindowStart } from "@/lib/attribution/constants";
import { recordRefundForLine, recordSale, reverseRemainingOrder } from "@/lib/attribution/ledger";
import {
  shopifyAttributedLines,
  shopifyOrderIdentity,
  shopifyRefundIdentity,
  shopifyRefundLines,
} from "@/lib/attribution/shopify-order";
import { decodeCredentials } from "@/lib/utils/crypto";
import {
  getShopifyAccessToken,
  getShopifyOrderTaxesIncluded,
  normalizeShopifyDomain,
} from "@/lib/shopify/client";

async function taxesIncluded(connection: StoreConnectionRow, orderId: string): Promise<boolean> {
  if (!connection.apiKeyEncrypted) {
    throw new Error("Shopify credentials are missing");
  }
  const { clientId, clientSecret } = decodeCredentials(connection.apiKeyEncrypted);
  if (!clientId || !clientSecret) {
    throw new Error("Shopify credentials are incomplete");
  }
  const domain = normalizeShopifyDomain(connection.storeUrl);
  const token = await getShopifyAccessToken(domain, clientId, clientSecret, connection.id);
  return getShopifyOrderTaxesIncluded(domain, token, orderId);
}

async function attributePaidOrder(connection: StoreConnectionRow, payload: unknown): Promise<void> {
  const identity = shopifyOrderIdentity(payload);
  if (!identity) return;
  const lines = shopifyAttributedLines(payload);
  const until = identity.placedAt;
  const since = attributionWindowStart(until);

  for (const line of lines) {
    const matched = await hasSuccessfulCartAdd({
      ownerId: connection.ownerId,
      platform: "shopify",
      platformItemId: line.variantId,
      sessionId: line.sessionId,
      sinceIso: since,
      untilIso: until,
    });
    if (!matched) continue;
    await recordSale({
      ownerId: connection.ownerId,
      platform: "shopify",
      orderId: identity.orderId,
      orderName: identity.orderName,
      lineId: line.lineId,
      platformItemId: line.variantId,
      productName: line.name,
      amountMajor: line.amountMajor,
      currency: line.currency,
      sessionId: line.sessionId,
      matchMethod: "line_tag",
      occurredAt: identity.occurredAt,
    });
  }
}

async function attributeRefund(connection: StoreConnectionRow, payload: unknown): Promise<void> {
  const identity = shopifyRefundIdentity(payload);
  if (!identity) return;
  const included = await taxesIncluded(connection, identity.orderId);
  const lines = shopifyRefundLines(payload, included);
  for (const line of lines) {
    await recordRefundForLine({
      ownerId: connection.ownerId,
      platform: "shopify",
      orderId: identity.orderId,
      lineId: line.lineId,
      platformItemId: null,
      refundId: identity.refundId,
      amountMajor: line.amountMajor,
      currency: line.currency,
      occurredAt: identity.occurredAt,
    });
  }
}

export async function applyShopifyOrderTopic(
  connection: StoreConnectionRow,
  topic: string,
  payload: unknown
): Promise<void> {
  if (!connection.ownerId) return;
  if (topic === "orders/paid") {
    await attributePaidOrder(connection, payload);
    return;
  }
  if (topic === "refunds/create") {
    await attributeRefund(connection, payload);
    return;
  }
  if (topic === "orders/cancelled") {
    const identity = shopifyOrderIdentity(payload);
    if (!identity) return;
    await reverseRemainingOrder({
      ownerId: connection.ownerId,
      platform: "shopify",
      orderId: identity.orderId,
      occurredAt: identity.occurredAt,
    });
  }
}
