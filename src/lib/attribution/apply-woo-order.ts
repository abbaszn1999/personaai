import { hashVisitorSignal } from "@/lib/utils/internal-auth";
import { listCartAddsForItems } from "@/lib/db/cart-events";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { attributionWindowStart } from "@/lib/attribution/constants";
import { recordRefundForLine, recordSale, reverseRemainingOrder } from "@/lib/attribution/ledger";
import { matchWooOrderLines, type WooCartCandidate, type WooOrderLine } from "@/lib/attribution/woo-match";
import { decodeCredentials } from "@/lib/utils/crypto";
import { getWooOrderRefunds, normalizeWordPressUrl, type WooOrderRefund } from "@/lib/woocommerce/client";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function wooInstant(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value);
  const parsed = Date.parse(hasZone ? value : `${value}Z`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function major(value: unknown): number {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(amount) ? amount : 0;
}

function orderLines(payload: Record<string, unknown>): WooOrderLine[] {
  const lines = Array.isArray(payload.line_items) ? payload.line_items : [];
  const out: WooOrderLine[] = [];
  for (const entry of lines) {
    const line = asRecord(entry);
    if (!line || line.id === undefined || line.id === null) continue;
    const variation = Number(line.variation_id);
    const product = Number(line.product_id);
    const itemId = variation > 0 ? String(variation) : product > 0 ? String(product) : "";
    if (!itemId) continue;
    const total = major(line.total);
    const name = typeof line.name === "string" && line.name.trim() ? line.name.trim() : "Item";
    out.push({ id: String(line.id), itemId, name, total });
  }
  return out;
}

function isPaid(payload: Record<string, unknown>): boolean {
  const status = payload.status;
  return (status === "processing" || status === "completed") && Boolean(payload.date_paid_gmt || payload.date_paid);
}

/** Fields without `_gmt` are in the site's own timezone, so they are only a last resort. */
async function attributePaid(connection: StoreConnectionRow, payload: Record<string, unknown>): Promise<void> {
  if (!isPaid(payload) || payload.id === undefined || payload.id === null) return;
  const placedAt = wooInstant(payload.date_created_gmt) ?? wooInstant(payload.date_created);
  const occurredAt = wooInstant(payload.date_paid_gmt) ?? wooInstant(payload.date_paid) ?? placedAt;
  if (!placedAt || !occurredAt) return;

  const lines = orderLines(payload);
  const ip = typeof payload.customer_ip_address === "string" ? payload.customer_ip_address.trim() : "";
  const ua = typeof payload.customer_user_agent === "string" ? payload.customer_user_agent.trim() : "";
  const ipHash = ip ? hashVisitorSignal(connection.ownerId, "ip", ip) : null;
  const uaHash = ua ? hashVisitorSignal(connection.ownerId, "ua", ua) : null;

  const events = await listCartAddsForItems({
    ownerId: connection.ownerId,
    platform: "wordpress",
    platformItemIds: lines.map((line) => line.itemId),
    sinceIso: attributionWindowStart(placedAt),
    untilIso: placedAt,
  });
  const candidates: WooCartCandidate[] = events.map((event) => ({
    platformItemId: event.platformItemId,
    sessionId: event.sessionId,
    ipHash: event.ipHash,
    uaHash: event.uaHash,
    createdAt: event.createdAt,
  }));

  const matched = matchWooOrderLines({ dateCreated: placedAt, ipHash, uaHash, lines }, candidates);
  const orderId = String(payload.id);
  const number = payload.number;
  const orderName = typeof number === "string" || typeof number === "number" ? `#${number}` : `#${orderId}`;
  const currency = typeof payload.currency === "string" && payload.currency ? payload.currency : "USD";

  for (const line of matched) {
    await recordSale({
      ownerId: connection.ownerId,
      platform: "wordpress",
      orderId,
      orderName,
      lineId: line.lineId,
      platformItemId: line.itemId,
      productName: line.name,
      amountMajor: line.total,
      currency,
      sessionId: line.sessionId,
      matchMethod: "device_match",
      occurredAt,
    });
  }
}

function refundAmount(line: NonNullable<WooOrderRefund["line_items"]>[number]): number {
  return Math.abs(major(line.total));
}

async function attributeRefunds(connection: StoreConnectionRow, payload: Record<string, unknown>): Promise<void> {
  if (payload.id === undefined || payload.id === null || !connection.apiKeyEncrypted) return;
  const refunds = Array.isArray(payload.refunds) ? payload.refunds : [];
  const status = payload.status;
  if (refunds.length === 0 && status !== "refunded" && status !== "cancelled") return;

  if (status === "cancelled") {
    const occurredAt = wooInstant(payload.date_modified_gmt) ?? wooInstant(payload.date_modified) ?? new Date().toISOString();
    await reverseRemainingOrder({
      ownerId: connection.ownerId,
      platform: "wordpress",
      orderId: String(payload.id),
      occurredAt,
    });
    return;
  }

  const { wpUsername, wpAppPassword } = decodeCredentials(connection.apiKeyEncrypted);
  if (!wpUsername || !wpAppPassword) return;
  const detailed = await getWooOrderRefunds(
    normalizeWordPressUrl(connection.storeUrl),
    wpUsername,
    wpAppPassword,
    String(payload.id)
  );

  for (const refund of detailed) {
    const occurredAt = wooInstant(refund.date_created_gmt) ?? wooInstant(refund.date_created) ?? new Date().toISOString();
    for (const line of refund.line_items ?? []) {
      const amount = refundAmount(line);
      if (amount <= 0) continue;
      const variation = Number(line.variation_id);
      const product = Number(line.product_id);
      const itemId = variation > 0 ? String(variation) : product > 0 ? String(product) : null;
      const refundedMeta = (line.meta_data ?? []).find((meta) => meta.key === "_refunded_item_id")?.value;
      const refundedItemId =
        refundedMeta !== undefined && refundedMeta !== null && String(refundedMeta).trim() ? String(refundedMeta) : null;
      await recordRefundForLine({
        ownerId: connection.ownerId,
        platform: "wordpress",
        orderId: String(payload.id),
        lineId: refundedItemId,
        platformItemId: itemId,
        refundId: String(refund.id),
        amountMajor: amount,
        currency: typeof payload.currency === "string" && payload.currency ? payload.currency : "USD",
        occurredAt,
      });
    }
  }
}

export async function applyWooOrder(connection: StoreConnectionRow, payload: unknown): Promise<void> {
  const order = asRecord(payload);
  if (!order || !connection.ownerId) return;
  await attributePaid(connection, order);
  await attributeRefunds(connection, order);
}
