import { fxDay, toUsdCents } from "@/lib/attribution/fx";
import {
  insertLedgerEntry,
  listOrderEntries,
  type GmvMatchMethod,
  type GmvPlatform,
  type LedgerEntry,
} from "@/lib/db/gmv";
import { getLatestBillingSubscription, getOrCreateBillingAccount } from "@/lib/db/billing";

async function saleIsBillable(ownerId: string): Promise<boolean> {
  const account = await getOrCreateBillingAccount(ownerId);
  if (!account || account.accessMode === "legacy_test") return false;
  const subscription = await getLatestBillingSubscription(ownerId);
  if (!subscription) return false;
  return subscription.tierId === "main" && (subscription.status === "active" || subscription.status === "past_due");
}

export async function recordSale(input: {
  ownerId: string;
  platform: GmvPlatform;
  orderId: string;
  orderName: string | null;
  lineId: string;
  platformItemId: string | null;
  productName: string;
  amountMajor: number;
  currency: string;
  sessionId: string | null;
  matchMethod: GmvMatchMethod;
  occurredAt: string;
}): Promise<void> {
  if (input.amountMajor <= 0) return;
  const converted = await toUsdCents(input.amountMajor, input.currency, fxDay(input.occurredAt));
  await insertLedgerEntry({
    ownerId: input.ownerId,
    platform: input.platform,
    orderId: input.orderId,
    orderName: input.orderName,
    lineId: input.lineId,
    platformItemId: input.platformItemId,
    productName: input.productName,
    kind: "sale",
    sourceKey: `sale:${input.orderId}:${input.lineId}`,
    amountOriginal: input.amountMajor,
    currency: input.currency.trim().toUpperCase(),
    fxRate: converted.fxRate,
    amountUsdCents: converted.amountUsdCents,
    sessionId: input.sessionId,
    matchMethod: input.matchMethod,
    billable: await saleIsBillable(input.ownerId),
    occurredAt: input.occurredAt,
  });
}

function remainingCents(entries: LedgerEntry[], lineId: string): number {
  return entries
    .filter((entry) => entry.lineId === lineId)
    .reduce((sum, entry) => sum + Math.round(entry.amountOriginal * 100), 0);
}

function pickSale(entries: LedgerEntry[], lineId: string | null, itemId: string | null): LedgerEntry | null {
  const sales = entries.filter((entry) => entry.kind === "sale");
  const exact = lineId ? sales.find((entry) => entry.lineId === lineId && remainingCents(entries, entry.lineId) > 0) : undefined;
  if (exact) return exact;
  const byItem = itemId
    ? sales.filter((entry) => entry.platformItemId === itemId && remainingCents(entries, entry.lineId) > 0)
    : [];
  return byItem.sort((a, b) => remainingCents(entries, b.lineId) - remainingCents(entries, a.lineId))[0] ?? null;
}

/**
 * A refund is billable only when the sale it reverses was billable. Otherwise a trial sale
 * refunded after an upgrade would credit the merchant for GMV that was never charged, and a
 * Main sale refunded after a downgrade would keep a commission on returned goods.
 */
export async function recordRefundForLine(input: {
  ownerId: string;
  platform: GmvPlatform;
  orderId: string;
  lineId: string | null;
  platformItemId: string | null;
  refundId: string;
  amountMajor: number;
  currency: string;
  occurredAt: string;
}): Promise<void> {
  if (input.amountMajor <= 0) return;
  const entries = await listOrderEntries(input.ownerId, input.platform, input.orderId);
  const sale = pickSale(entries, input.lineId, input.platformItemId);
  if (!sale) return;

  const remaining = remainingCents(entries, sale.lineId) / 100;
  const amountMajor = Math.min(input.amountMajor, remaining);
  if (amountMajor <= 0) return;

  const converted = await toUsdCents(amountMajor, input.currency, fxDay(input.occurredAt));
  await insertLedgerEntry({
    ownerId: input.ownerId,
    platform: input.platform,
    orderId: input.orderId,
    orderName: sale.orderName,
    lineId: sale.lineId,
    platformItemId: sale.platformItemId,
    productName: sale.productName,
    kind: "refund",
    sourceKey: `refund:${input.refundId}:${sale.lineId}`,
    amountOriginal: -amountMajor,
    currency: input.currency.trim().toUpperCase(),
    fxRate: converted.fxRate,
    amountUsdCents: -Math.abs(converted.amountUsdCents),
    sessionId: sale.sessionId,
    matchMethod: sale.matchMethod,
    billable: sale.billable,
    occurredAt: input.occurredAt,
  });
}

/** Cancellation with no separate refund payload. Reverses whatever net value is still open. */
export async function reverseRemainingOrder(input: {
  ownerId: string;
  platform: GmvPlatform;
  orderId: string;
  occurredAt: string;
}): Promise<void> {
  const entries = await listOrderEntries(input.ownerId, input.platform, input.orderId);
  const lineIds = [...new Set(entries.filter((entry) => entry.kind === "sale").map((entry) => entry.lineId))];

  for (const lineId of lineIds) {
    const sale = entries.find((entry) => entry.kind === "sale" && entry.lineId === lineId);
    if (!sale) continue;
    const remaining = remainingCents(entries, lineId) / 100;
    if (remaining <= 0) continue;
    await recordRefundForLine({
      ownerId: input.ownerId,
      platform: input.platform,
      orderId: input.orderId,
      lineId,
      platformItemId: sale.platformItemId,
      refundId: `cancel:${input.orderId}`,
      amountMajor: remaining,
      currency: sale.currency,
      occurredAt: input.occurredAt,
    });
  }
}
