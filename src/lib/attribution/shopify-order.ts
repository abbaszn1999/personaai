import { PERSONA_LINE_PROPERTY } from "@/lib/attribution/constants";

export interface ShopifyAttributedLine {
  lineId: string;
  variantId: string;
  name: string;
  sessionId: string;
  /** Net line value in major units, after discounts and after included tax. */
  amountMajor: number;
  currency: string;
}

export interface ShopifyRefundLine {
  lineId: string;
  amountMajor: number;
  currency: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function shopMoneyCents(set: unknown): { cents: number; currency: string } | null {
  const money = asRecord(asRecord(set)?.shop_money);
  const amount = money?.amount;
  const currency = money?.currency_code;
  if (typeof amount !== "string" || typeof currency !== "string" || !currency.trim()) return null;
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  return { cents: Math.round(value * 100), currency: currency.trim().toUpperCase() };
}

function moneyListCents(value: unknown, setKey: "amount_set" | "price_set", plainKey: "amount" | "price"): number {
  if (!Array.isArray(value)) return 0;
  let total = 0;
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;
    const fromSet = shopMoneyCents(record[setKey]);
    if (fromSet) {
      total += fromSet.cents;
      continue;
    }
    const plain = Number(record[plainKey]);
    if (Number.isFinite(plain)) total += Math.round(plain * 100);
  }
  return total;
}

function personaSession(properties: unknown): string | null {
  if (!Array.isArray(properties)) return null;
  for (const property of properties) {
    const record = asRecord(property);
    if (!record) continue;
    const key = record.name ?? record.key;
    if (key !== PERSONA_LINE_PROPERTY) continue;
    const value = typeof record.value === "string" ? record.value.trim() : "";
    if (value) return value;
  }
  return null;
}

function lineNet(line: Record<string, unknown>, taxesIncluded: boolean): { cents: number; currency: string } | null {
  const quantity = typeof line.quantity === "number" && line.quantity > 0 ? line.quantity : 0;
  if (!quantity) return null;

  const unit = shopMoneyCents(line.price_set);
  const currency = unit?.currency ?? (typeof line.currency === "string" ? line.currency : "");
  const unitCents = unit?.cents ?? (Number.isFinite(Number(line.price)) ? Math.round(Number(line.price) * 100) : null);
  if (unitCents === null || !currency) return null;

  const discounts = moneyListCents(line.discount_allocations, "amount_set", "amount");
  const tax = taxesIncluded ? moneyListCents(line.tax_lines, "price_set", "price") : 0;
  const cents = Math.max(0, unitCents * quantity - discounts - tax);
  return { cents, currency };
}

/** Paid order lines that carry the hidden Persona tag. Untagged lines are ignored. */
export function shopifyAttributedLines(order: unknown): ShopifyAttributedLine[] {
  const raw = asRecord(order);
  if (!raw) return [];
  const taxesIncluded = raw.taxes_included === true;
  const lines = Array.isArray(raw.line_items) ? raw.line_items : [];
  const attributed: ShopifyAttributedLine[] = [];

  for (const entry of lines) {
    const line = asRecord(entry);
    if (!line) continue;
    const sessionId = personaSession(line.properties);
    if (!sessionId) continue;
    const net = lineNet(line, taxesIncluded);
    if (!net || net.cents <= 0) continue;
    const lineId = line.id;
    const variantId = line.variant_id;
    if (lineId === undefined || lineId === null || variantId === undefined || variantId === null) continue;
    const name = typeof line.name === "string" && line.name.trim()
      ? line.name.trim()
      : typeof line.title === "string" && line.title.trim()
        ? line.title.trim()
        : "Item";
    attributed.push({
      lineId: String(lineId),
      variantId: String(variantId),
      name,
      sessionId,
      amountMajor: net.cents / 100,
      currency: net.currency,
    });
  }

  return attributed;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

/** `placedAt` anchors the attribution window. `occurredAt` is when the sale counts, which can be
 *  days later for cash on delivery or manual payment. */
export function shopifyOrderIdentity(
  order: unknown
): { orderId: string; orderName: string; placedAt: string; occurredAt: string } | null {
  const raw = asRecord(order);
  if (!raw || raw.id === undefined || raw.id === null) return null;
  const now = new Date().toISOString();
  const placedAt = isoOrNull(raw.created_at) ?? isoOrNull(raw.processed_at) ?? now;
  const occurredAt = isoOrNull(raw.processed_at) ?? placedAt;
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : `#${raw.id}`;
  return { orderId: String(raw.id), orderName: name, placedAt, occurredAt };
}

/** Refund line amounts. When the order's prices include tax, tax is removed so the
 *  reversal matches the net that was recorded on the sale. */
export function shopifyRefundLines(refund: unknown, taxesIncluded: boolean): ShopifyRefundLine[] {
  const raw = asRecord(refund);
  if (!raw) return [];
  const lines = Array.isArray(raw.refund_line_items) ? raw.refund_line_items : [];
  const out: ShopifyRefundLine[] = [];

  for (const entry of lines) {
    const line = asRecord(entry);
    if (!line || line.line_item_id === undefined || line.line_item_id === null) continue;
    const subtotal = shopMoneyCents(line.subtotal_set);
    if (!subtotal) continue;
    const tax = taxesIncluded ? (shopMoneyCents(line.total_tax_set)?.cents ?? 0) : 0;
    const cents = Math.max(0, subtotal.cents - tax);
    if (cents <= 0) continue;
    out.push({ lineId: String(line.line_item_id), amountMajor: cents / 100, currency: subtotal.currency });
  }

  return out;
}

export function shopifyRefundIdentity(refund: unknown): { refundId: string; orderId: string; occurredAt: string } | null {
  const raw = asRecord(refund);
  if (!raw || raw.id === undefined || raw.id === null || raw.order_id === undefined || raw.order_id === null) return null;
  const occurred = typeof raw.created_at === "string" && raw.created_at ? raw.created_at : new Date().toISOString();
  return { refundId: String(raw.id), orderId: String(raw.order_id), occurredAt: occurred };
}
