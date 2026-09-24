import { getCartEventsInRange } from "./cart-events";
import { getSessionRowsForRange, type LiveSessionRow } from "./live-sessions";
import { getImageGenerationCount } from "./image-generations";
import { getTryOnEventsInRange } from "./try-on-events";
import { getChatEventsInRange } from "./chat-events";
import { getRealtimeTryOnEventsInRange } from "./realtime-tryon-events";
import { getStoreConnectionByOwner } from "./store-connections";
import { listLedgerEntriesInRange } from "./gmv";
import { getStripeCustomerIdForUser } from "./billing";
import { sumCustomerSpendUsdCents } from "@/lib/stripe/customer-spend";
import { LIVE_SESSION_PRODUCT_ID } from "@/lib/billing/live-session";
import {
  orderConversionRate,
  pointChange,
  returnOnSpend,
  summarizePersonaSales,
  utcDayKey,
  type PersonaSalesSummary,
  type SalesLedgerRow,
  type SalesMatchMethod,
} from "@/lib/analytics/persona-sales";

export type AnalyticsRange = "7d" | "30d" | "90d";

export type OrderTrackingStatus = "active" | "missing" | "unknown" | "not_connected";

export interface PersonaSalesPayload {
  orderTracking: OrderTrackingStatus;
  /** All amounts are USD cents, converted at the order's daily rate and net of refunds. */
  netUsdCents: number;
  grossUsdCents: number;
  refundsUsdCents: number;
  refundRate: number;
  orders: number;
  avgOrderUsdCents: number;
  /** Attributed orders per 100 widget sessions. */
  conversionRate: number;
  billableNetUsdCents: number;
  commissionUsdCents: number;
  unbilledNetUsdCents: number;
  /** What the account paid Persona in the window. Null when it can't be read. */
  spendUsdCents: number | null;
  /** Net sales per dollar paid to Persona. Null when nothing was paid. */
  roi: number | null;
  byMethod: Record<SalesMatchMethod, { netUsdCents: number; orders: number }>;
  topProducts: Array<{ key: string; name: string; orders: number; netUsdCents: number }>;
  previous: { netUsdCents: number; orders: number; conversionRate: number; avgOrderUsdCents: number };
}

const RANGE_DAYS: Record<AnalyticsRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

export const ANALYTICS_RANGES = Object.keys(RANGE_DAYS) as AnalyticsRange[];

export function parseAnalyticsRange(value: string | null): AnalyticsRange {
  return ANALYTICS_RANGES.includes(value as AnalyticsRange) ? (value as AnalyticsRange) : "30d";
}

/** The rolling window a range covers, ending now. */
export function analyticsWindow(range: AnalyticsRange, now = new Date()): { sinceIso: string; untilIso: string } {
  const since = new Date(now.getTime() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000);
  return { sinceIso: since.toISOString(), untilIso: now.toISOString() };
}

export interface WorkspaceAnalyticsPayload {
  kpis: {
    sessions: number;
    cartItemsAdded: number;
    cartValueAdded: number;
    currency: string;
    /** % of sessions in range with >=1 successful add-to-cart. */
    addToCartRate: number;
    avgCartItemValue: number;
    trends: { sessions: number; cartItemsAdded: number; cartValueAdded: number; addToCartRate: number };
  };
  /** salesUsd is attributed net sales in USD; cartValue stays in the store currency. */
  activityByDay: Array<{ date: string; sessions: number; cartValue: number; salesUsd: number }>;
  /** Sessions opened, engaged (try-on, live preview or assistant), added to cart, and ordered
   *  through an attributed sale. Each step counts sessions, so steps are comparable. */
  funnel: Array<{ label: string; value: number }>;
  sales: PersonaSalesPayload;
  topProducts: Array<{ productId: string; name: string; addCount: number; addValue: number }>;
  shopperStats: { newSessions: number; returningSessions: number; avgSessionDurationSeconds: number };
  imagesGenerated: number;
  /** null when there's no try-on activity at all in range — wearable-mode-only, and even for
   *  wearable workspaces a shopper may never generate one. See getTryOnEventsInRange. */
  tryOnInsights: {
    avgTryOnsPerSession: number;
    mostTriedOnProducts: Array<{ productId: string; name: string; tryOns: number }>;
    topRecommendedSizes: Array<{ size: string; count: number; percentage: number }>;
  } | null;
  /** null when no shopper has started a live camera try-on at all in range — wearable-mode-only.
   *  See getRealtimeTryOnEventsInRange. Kept as its own container (rather than folded into
   *  tryOnInsights) since it's a distinct feature (Decart realtime camera vs. static image
   *  generation). totalSeconds counts billable session rows only, so garment previews do not
   *  add to the billed duration. */
  liveTryOnInsights: {
    totalSessions: number;
    /** One preview = one switchProduct() call the shopper actively ran until the next switch
     *  or session end (see realtime_tryon_events.sql). */
    totalPreviews: number;
    avgPreviewsPerSession: number;
    totalSeconds: number;
    avgSessionDurationSeconds: number;
    mostPreviewedProducts: Array<{ productId: string; name: string; previews: number }>;
  } | null;
  /** null when there's no chat activity at all in range — unwearable-mode-only. See
   *  getChatEventsInRange. */
  assistantInsights: {
    totalMessages: number;
    avgMessagesPerSession: number;
    topTopics: Array<{ topic: string; count: number }>;
  } | null;
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

const dayKey = utcDayKey;

function toSalesRows(entries: Awaited<ReturnType<typeof listLedgerEntriesInRange>>): SalesLedgerRow[] {
  return entries.map((entry) => ({
    orderId: `${entry.platform}:${entry.orderId}`,
    productName: entry.productName,
    platformItemId: entry.platformItemId,
    kind: entry.kind,
    amountUsdCents: entry.amountUsdCents,
    matchMethod: entry.matchMethod,
    billable: entry.billable,
    sessionId: entry.sessionId,
    occurredAt: entry.occurredAt,
  }));
}

async function loadSales(ownerId: string, sinceIso: string, untilIso: string): Promise<PersonaSalesSummary> {
  try {
    return summarizePersonaSales(toSalesRows(await listLedgerEntriesInRange(ownerId, sinceIso, untilIso)));
  } catch (error) {
    console.error("[db/analytics loadSales]", error);
    return summarizePersonaSales([]);
  }
}

async function loadSpend(ownerId: string, sinceIso: string, untilIso: string): Promise<number | null> {
  try {
    const customerId = await getStripeCustomerIdForUser(ownerId);
    if (!customerId) return 0;
    return await sumCustomerSpendUsdCents(customerId, sinceIso, untilIso);
  } catch (error) {
    console.error("[db/analytics loadSpend]", error);
    return null;
  }
}

async function loadOrderTracking(ownerId: string): Promise<OrderTrackingStatus> {
  const connection = await getStoreConnectionByOwner(ownerId);
  if (!connection) return "not_connected";
  return connection.ordersAccess ?? "unknown";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface WindowStats {
  sessionRows: LiveSessionRow[];
  successfulEvents: Awaited<ReturnType<typeof getCartEventsInRange>>;
  sessions: number;
  newSessions: number;
  returningSessions: number;
  cartItemsAdded: number;
  cartValueAdded: number;
  currency: string;
  sessionsWithAdds: number;
  addToCartRate: number;
  avgCartItemValue: number;
  avgSessionDurationSeconds: number;
}

/** Computes every metric for one time window (either the requested range, or the preceding
 *  equal-length window used for the trend comparisons). All Persona-attributed: everything
 *  here comes from live_sessions heartbeats and cart_events the widget itself
 *  logged, never from a WooCommerce order/webhook. */
async function computeWindow(workspaceId: string, sinceIso: string, untilIso: string): Promise<WindowStats> {
  const [cartEvents, sessionRows] = await Promise.all([
    getCartEventsInRange(workspaceId, sinceIso, untilIso),
    getSessionRowsForRange(workspaceId, sinceIso, untilIso),
  ]);

  const successfulEvents = cartEvents.filter((e) => e.success);
  const cartItemsAdded = successfulEvents.reduce((sum, e) => sum + e.quantity, 0);
  const cartValueAdded = successfulEvents.reduce((sum, e) => sum + e.price * e.quantity, 0);
  const currency = successfulEvents[0]?.currency ?? cartEvents[0]?.currency ?? "USD";

  const newSessions = sessionRows.filter((s) => s.startedAt >= sinceIso).length;
  const returningSessions = sessionRows.length - newSessions;
  const sessions = sessionRows.length;

  const sessionsWithAdds = new Set(successfulEvents.map((e) => e.sessionId)).size;
  const addToCartRate = sessions > 0 ? Math.round((sessionsWithAdds / sessions) * 1000) / 10 : 0;
  const avgCartItemValue = cartItemsAdded > 0 ? cartValueAdded / cartItemsAdded : 0;

  // Caveat: for a session that goes quiet and later resumes, this overcounts idle time as
  // "duration" since last_seen_at - started_at spans the whole gap, not just active time.
  // Acceptable approximation — there's no per-heartbeat log to compute true active time from.
  const avgSessionDurationSeconds =
    sessionRows.length > 0
      ? Math.round(
          sessionRows.reduce(
            (sum, s) => sum + (new Date(s.lastSeenAt).getTime() - new Date(s.startedAt).getTime()) / 1000,
            0
          ) / sessionRows.length
        )
      : 0;

  return {
    sessionRows,
    successfulEvents,
    sessions,
    newSessions,
    returningSessions,
    cartItemsAdded,
    cartValueAdded,
    currency,
    sessionsWithAdds,
    addToCartRate,
    avgCartItemValue,
    avgSessionDurationSeconds,
  };
}

/**
 * Aggregates everything the analytics dashboard needs for one workspace, strictly from data
 * Persona itself caused: shopper heartbeats (`live_sessions`), logged cart-add
 * outcomes (`cart_events`), and avatar/try-on image generations (`image_generations`, keyed by
 * the workspace owner's account). Sales come only from `gmv_ledger`, which holds order lines
 * already attributed to a widget session; unattributed store revenue is never read.
 */
export async function getWorkspaceAnalytics(
  workspaceId: string,
  ownerId: string,
  range: AnalyticsRange
): Promise<WorkspaceAnalyticsPayload> {
  const days = RANGE_DAYS[range];
  const now = new Date();
  const { sinceIso, untilIso } = analyticsWindow(range, now);
  const prevSince = new Date(Date.parse(sinceIso) - days * 24 * 60 * 60 * 1000);

  const prevSinceIso = prevSince.toISOString();
  const [
    current,
    previous,
    imagesGenerated,
    tryOnEvents,
    realtimeTryOnEvents,
    chatEvents,
    sales,
    previousSales,
    spendUsdCents,
    orderTracking,
  ] = await Promise.all([
    computeWindow(workspaceId, sinceIso, untilIso),
    computeWindow(workspaceId, prevSinceIso, sinceIso),
    getImageGenerationCount(ownerId, sinceIso),
    getTryOnEventsInRange(workspaceId, sinceIso, untilIso),
    getRealtimeTryOnEventsInRange(workspaceId, sinceIso, untilIso),
    getChatEventsInRange(workspaceId, sinceIso, untilIso),
    loadSales(ownerId, sinceIso, untilIso),
    loadSales(ownerId, prevSinceIso, sinceIso),
    loadSpend(ownerId, sinceIso, untilIso),
    loadOrderTracking(ownerId),
  ]);

  const dayBuckets = new Map<string, { sessions: number; cartValue: number; salesUsdCents: number }>();
  for (let i = days - 1; i >= 0; i--) {
    dayBuckets.set(dayKey(new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString()), {
      sessions: 0,
      cartValue: 0,
      salesUsdCents: 0,
    });
  }
  for (const [key, cents] of sales.byDay) {
    const bucket = dayBuckets.get(key);
    if (bucket) bucket.salesUsdCents += cents;
  }
  for (const s of current.sessionRows) {
    if (s.startedAt < sinceIso) continue; // only "new opens" land in the per-day bucket
    const bucket = dayBuckets.get(dayKey(s.startedAt));
    if (bucket) bucket.sessions += 1;
  }
  for (const e of current.successfulEvents) {
    const bucket = dayBuckets.get(dayKey(e.createdAt));
    if (bucket) bucket.cartValue += e.price * e.quantity;
  }

  const activityByDay = Array.from(dayBuckets.entries()).map(([key, v]) => ({
    date: new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    sessions: v.sessions,
    cartValue: round2(v.cartValue),
    salesUsd: round2(v.salesUsdCents / 100),
  }));

  const sessionIdsInRange = new Set(current.sessionRows.map((row) => row.sessionId));
  const engagedSessions = new Set<string>();
  for (const event of [...tryOnEvents, ...realtimeTryOnEvents, ...chatEvents]) {
    if (sessionIdsInRange.has(event.sessionId)) engagedSessions.add(event.sessionId);
  }
  for (const event of current.successfulEvents) {
    if (sessionIdsInRange.has(event.sessionId)) engagedSessions.add(event.sessionId);
  }

  const productMap = new Map<string, { name: string; addCount: number; addValue: number }>();
  for (const e of current.successfulEvents) {
    const existing = productMap.get(e.productId) ?? { name: e.productName, addCount: 0, addValue: 0 };
    existing.addCount += e.quantity;
    existing.addValue += e.price * e.quantity;
    existing.name = e.productName;
    productMap.set(e.productId, existing);
  }
  const topProducts = Array.from(productMap.entries())
    .map(([productId, v]) => ({ productId, name: v.name, addCount: v.addCount, addValue: round2(v.addValue) }))
    .sort((a, b) => b.addCount - a.addCount)
    .slice(0, 5);

  let tryOnInsights: WorkspaceAnalyticsPayload["tryOnInsights"] = null;
  if (tryOnEvents.length > 0) {
    const generationIds = new Set(tryOnEvents.map((e) => e.generationId));
    const sessionIds = new Set(tryOnEvents.map((e) => e.sessionId));
    const avgTryOnsPerSession =
      sessionIds.size > 0 ? Math.round((generationIds.size / sessionIds.size) * 10) / 10 : 0;

    const productCounts = new Map<string, { name: string; tryOns: number }>();
    for (const e of tryOnEvents) {
      const existing = productCounts.get(e.productId) ?? { name: e.productName, tryOns: 0 };
      existing.tryOns += 1;
      existing.name = e.productName;
      productCounts.set(e.productId, existing);
    }
    const mostTriedOnProducts = Array.from(productCounts.entries())
      .map(([productId, v]) => ({ productId, name: v.name, tryOns: v.tryOns }))
      .sort((a, b) => b.tryOns - a.tryOns)
      .slice(0, 5);

    const sizeCounts = new Map<string, number>();
    for (const e of tryOnEvents) sizeCounts.set(e.recommendedSize, (sizeCounts.get(e.recommendedSize) ?? 0) + 1);
    const totalSizeSamples = tryOnEvents.length;
    const topRecommendedSizes = Array.from(sizeCounts.entries())
      .map(([size, count]) => ({ size, count, percentage: Math.round((count / totalSizeSamples) * 100) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    tryOnInsights = { avgTryOnsPerSession, mostTriedOnProducts, topRecommendedSizes };
  }

  let assistantInsights: WorkspaceAnalyticsPayload["assistantInsights"] = null;
  if (chatEvents.length > 0) {
    const sessionIds = new Set(chatEvents.map((e) => e.sessionId));
    const avgMessagesPerSession =
      sessionIds.size > 0 ? Math.round((chatEvents.length / sessionIds.size) * 10) / 10 : 0;

    const topicCounts = new Map<string, number>();
    for (const e of chatEvents) {
      if (!e.topic) continue;
      topicCounts.set(e.topic, (topicCounts.get(e.topic) ?? 0) + 1);
    }
    const topTopics = Array.from(topicCounts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    assistantInsights = { totalMessages: chatEvents.length, avgMessagesPerSession, topTopics };
  }

  let liveTryOnInsights: WorkspaceAnalyticsPayload["liveTryOnInsights"] = null;
  if (realtimeTryOnEvents.length > 0) {
    const sessionIds = new Set(realtimeTryOnEvents.map((event) => event.sessionId));
    const totalSessions = sessionIds.size;
    const previews = realtimeTryOnEvents.filter((event) => event.productId !== LIVE_SESSION_PRODUCT_ID);
    const totalPreviews = previews.length;
    const totalSeconds = realtimeTryOnEvents.reduce(
      (sum, event) => sum + (event.billable ? event.durationSeconds : 0),
      0
    );

    const productCounts = new Map<string, { name: string; previews: number }>();
    for (const event of previews) {
      const existing = productCounts.get(event.productId) ?? { name: event.productName, previews: 0 };
      existing.previews += 1;
      existing.name = event.productName;
      productCounts.set(event.productId, existing);
    }

    liveTryOnInsights = {
      totalSessions,
      totalPreviews,
      avgPreviewsPerSession: totalSessions > 0 ? Math.round((totalPreviews / totalSessions) * 10) / 10 : 0,
      totalSeconds,
      avgSessionDurationSeconds: totalSessions > 0 ? Math.round(totalSeconds / totalSessions) : 0,
      mostPreviewedProducts: Array.from(productCounts.entries())
        .map(([productId, value]) => ({ productId, name: value.name, previews: value.previews }))
        .sort((a, b) => b.previews - a.previews)
        .slice(0, 5),
    };
  }

  return {
    kpis: {
      sessions: current.sessions,
      cartItemsAdded: current.cartItemsAdded,
      cartValueAdded: round2(current.cartValueAdded),
      currency: current.currency,
      addToCartRate: current.addToCartRate,
      avgCartItemValue: round2(current.avgCartItemValue),
      trends: {
        sessions: pctChange(current.sessions, previous.sessions),
        cartItemsAdded: pctChange(current.cartItemsAdded, previous.cartItemsAdded),
        cartValueAdded: pctChange(current.cartValueAdded, previous.cartValueAdded),
        addToCartRate: pointChange(current.addToCartRate, previous.addToCartRate),
      },
    },
    activityByDay,
    funnel: [
      { label: "Opened the widget", value: current.sessions },
      { label: "Engaged", value: engagedSessions.size },
      { label: "Added to cart", value: current.sessionsWithAdds },
      {
        label: "Placed an order",
        value: Array.from(sales.orderSessionIds).filter((id) => sessionIdsInRange.has(id)).length,
      },
    ],
    sales: {
      orderTracking,
      netUsdCents: sales.netUsdCents,
      grossUsdCents: sales.grossUsdCents,
      refundsUsdCents: sales.refundsUsdCents,
      refundRate: sales.refundRate,
      orders: sales.orders,
      avgOrderUsdCents: sales.avgOrderUsdCents,
      conversionRate: orderConversionRate(sales.orders, current.sessions),
      billableNetUsdCents: sales.billableNetUsdCents,
      commissionUsdCents: sales.commissionUsdCents,
      unbilledNetUsdCents: sales.unbilledNetUsdCents,
      spendUsdCents,
      roi: returnOnSpend(sales.netUsdCents, spendUsdCents),
      byMethod: sales.byMethod,
      topProducts: sales.topProducts,
      previous: {
        netUsdCents: previousSales.netUsdCents,
        orders: previousSales.orders,
        conversionRate: orderConversionRate(previousSales.orders, previous.sessions),
        avgOrderUsdCents: previousSales.avgOrderUsdCents,
      },
    },
    topProducts,
    shopperStats: {
      newSessions: current.newSessions,
      returningSessions: current.returningSessions,
      avgSessionDurationSeconds: current.avgSessionDurationSeconds,
    },
    imagesGenerated,
    tryOnInsights,
    liveTryOnInsights,
    assistantInsights,
  };
}
