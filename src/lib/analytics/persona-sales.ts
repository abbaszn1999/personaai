import { GMV_COMMISSION_RATE } from "@/lib/billing/pricing";

export type SalesMatchMethod = "line_tag" | "device_match";

export interface SalesLedgerRow {
  orderId: string;
  productName: string;
  platformItemId: string | null;
  kind: "sale" | "refund";
  amountUsdCents: number;
  matchMethod: SalesMatchMethod;
  billable: boolean;
  sessionId: string | null;
  occurredAt: string;
}

export interface PersonaSalesSummary {
  grossUsdCents: number;
  refundsUsdCents: number;
  netUsdCents: number;
  orders: number;
  /** Gross sale value per attributed order, before refunds. */
  avgOrderUsdCents: number;
  /** Refunded share of gross sales, 0-100 with one decimal. */
  refundRate: number;
  /** Widget sessions that led to at least one attributed sale. */
  orderSessionIds: Set<string>;
  /** Net Main-plan sales, the base of the 3% commission. */
  billableNetUsdCents: number;
  commissionUsdCents: number;
  /** Net sales made on Trial, which carry no commission. */
  unbilledNetUsdCents: number;
  byMethod: Record<SalesMatchMethod, { netUsdCents: number; orders: number }>;
  byDay: Map<string, number>;
  topProducts: Array<{ key: string; name: string; orders: number; netUsdCents: number }>;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** UTC calendar day of a timestamp, the same bucket the rest of the page uses. */
export function utcDayKey(iso: string): string {
  const at = Date.parse(iso);
  return Number.isFinite(at) ? new Date(at).toISOString().slice(0, 10) : iso.slice(0, 10);
}

/**
 * Totals for attributed ledger rows inside one window. Sales are positive and refunds negative,
 * so net is post-refund, which is also what the commission is charged on.
 */
export function summarizePersonaSales(rows: SalesLedgerRow[], topLimit = 5): PersonaSalesSummary {
  let grossUsdCents = 0;
  let refundsUsdCents = 0;
  let billableNetUsdCents = 0;
  let unbilledNetUsdCents = 0;
  const orderIds = new Set<string>();
  const sessions = new Set<string>();
  const methodOrders: Record<SalesMatchMethod, Set<string>> = { line_tag: new Set(), device_match: new Set() };
  const byMethod: PersonaSalesSummary["byMethod"] = {
    line_tag: { netUsdCents: 0, orders: 0 },
    device_match: { netUsdCents: 0, orders: 0 },
  };
  const byDay = new Map<string, number>();
  const products = new Map<string, { name: string; orders: Set<string>; netUsdCents: number }>();

  for (const row of rows) {
    const cents = Math.round(row.amountUsdCents);
    if (row.kind === "sale") {
      grossUsdCents += cents;
      orderIds.add(row.orderId);
      methodOrders[row.matchMethod]?.add(row.orderId);
      if (row.sessionId) sessions.add(row.sessionId);
    } else {
      refundsUsdCents += Math.abs(cents);
    }
    if (row.billable) billableNetUsdCents += cents;
    else unbilledNetUsdCents += cents;
    if (byMethod[row.matchMethod]) byMethod[row.matchMethod].netUsdCents += cents;

    const day = utcDayKey(row.occurredAt);
    byDay.set(day, (byDay.get(day) ?? 0) + cents);

    const key = row.platformItemId ?? row.productName;
    const product = products.get(key) ?? { name: row.productName, orders: new Set<string>(), netUsdCents: 0 };
    product.netUsdCents += cents;
    if (row.kind === "sale") product.orders.add(row.orderId);
    product.name = row.productName || product.name;
    products.set(key, product);
  }

  byMethod.line_tag.orders = methodOrders.line_tag.size;
  byMethod.device_match.orders = methodOrders.device_match.size;

  const orders = orderIds.size;
  const netUsdCents = grossUsdCents - refundsUsdCents;
  return {
    grossUsdCents,
    refundsUsdCents,
    netUsdCents,
    orders,
    avgOrderUsdCents: orders > 0 ? Math.round(grossUsdCents / orders) : 0,
    refundRate: grossUsdCents > 0 ? round1((refundsUsdCents / grossUsdCents) * 100) : 0,
    orderSessionIds: sessions,
    billableNetUsdCents,
    commissionUsdCents: billableNetUsdCents > 0 ? Math.round(billableNetUsdCents * GMV_COMMISSION_RATE) : 0,
    unbilledNetUsdCents,
    byMethod,
    byDay,
    topProducts: Array.from(products.entries())
      .map(([key, value]) => ({ key, name: value.name, orders: value.orders.size, netUsdCents: value.netUsdCents }))
      .filter((product) => product.orders > 0 || product.netUsdCents !== 0)
      .sort((left, right) => right.netUsdCents - left.netUsdCents || right.orders - left.orders)
      .slice(0, topLimit),
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const METHOD_LABEL: Record<SalesMatchMethod, string> = {
  line_tag: "Tagged cart line",
  device_match: "Same device added it within 7 days",
};

/** One row per attributed order line. Never includes shopper details. */
export function attributedOrdersCsv(
  rows: Array<{
    occurredAt: string;
    orderId: string;
    orderName: string | null;
    productName: string;
    kind: "sale" | "refund";
    amountOriginal: number;
    currency: string;
    amountUsdCents: number;
    matchMethod: SalesMatchMethod;
    billable: boolean;
    chargeId: string | null;
  }>
): string {
  const header = ["Date (UTC)", "Order", "Product", "Type", "Amount", "Currency", "Amount (USD)", "Attribution", "Commission status"];
  const lines = rows.map((row) =>
    [
      row.occurredAt.slice(0, 19).replace("T", " "),
      row.orderName ?? `#${row.orderId}`,
      row.productName,
      row.kind === "sale" ? "Sale" : "Refund",
      row.amountOriginal.toFixed(2),
      row.currency,
      (row.amountUsdCents / 100).toFixed(2),
      METHOD_LABEL[row.matchMethod] ?? row.matchMethod,
      row.chargeId ? "Billed" : row.billable ? "Pending" : "Trial (no commission)",
    ]
      .map(csvCell)
      .join(",")
  );
  return `${[header.join(","), ...lines].join("\r\n")}\r\n`;
}

/** Attributed orders per 100 widget sessions. */
export function orderConversionRate(orders: number, sessions: number): number {
  return sessions > 0 ? round1((orders / sessions) * 100) : 0;
}

/** Net attributed sales per dollar paid to Persona. Null when nothing was paid in the window. */
export function returnOnSpend(netUsdCents: number, paidUsdCents: number | null): number | null {
  if (paidUsdCents === null || paidUsdCents <= 0) return null;
  return Math.round((netUsdCents / paidUsdCents) * 10) / 10;
}

/** Relative change in percent. Zero-to-something reads as +100 rather than infinity. */
export function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return round1(((current - previous) / previous) * 100);
}

/** A rate compared to a rate: the difference in percentage points, not a percent of a percent. */
export function pointChange(current: number, previous: number): number {
  return round1(current - previous);
}
