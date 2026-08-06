import { getCartEventsInRange } from "./cart-events";
import { getSessionRowsForRange, type LiveSessionRow } from "./live-sessions";
import { getImageGenerationCount } from "./image-generations";
import { getTryOnEventsInRange } from "./try-on-events";
import { getChatEventsInRange } from "./chat-events";
import { getRealtimeTryOnEventsInRange } from "./realtime-tryon-events";

export type AnalyticsRange = "7d" | "30d" | "90d";

const RANGE_DAYS: Record<AnalyticsRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

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
  activityByDay: Array<{ date: string; sessions: number; cartValue: number }>;
  /** Always exactly 2 steps: sessions opened → sessions that added something to cart. No
   *  "Product Views" or "Purchase" step — neither has a real data source (see plan). */
  funnel: Array<{ label: string; value: number }>;
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
   *  tryOnInsights) since it's a distinct feature (Decart realtime camera vs. static Gemini
   *  image generation) with its own session/duration semantics. */
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

function dayKey(iso: string): string {
  return iso.slice(0, 10);
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
 *  here comes from workspace_live_sessions heartbeats and cart_events the widget itself
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
 * Persona itself caused: shopper heartbeats (`workspace_live_sessions`), logged cart-add
 * outcomes (`cart_events`), and avatar/try-on image generations (`image_generations`, keyed by
 * the workspace owner's account). Never touches WooCommerce order/revenue data — see the plan
 * this implements for why that's deliberately out of scope.
 */
export async function getWorkspaceAnalytics(
  workspaceId: string,
  ownerId: string,
  range: AnalyticsRange
): Promise<WorkspaceAnalyticsPayload> {
  const days = RANGE_DAYS[range];
  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const prevSince = new Date(since.getTime() - days * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();
  const untilIso = now.toISOString();

  const [current, previous, imagesGenerated, tryOnEvents, realtimeTryOnEvents, chatEvents] = await Promise.all([
    computeWindow(workspaceId, sinceIso, untilIso),
    computeWindow(workspaceId, prevSince.toISOString(), sinceIso),
    getImageGenerationCount(ownerId, sinceIso),
    getTryOnEventsInRange(workspaceId, sinceIso, untilIso),
    getRealtimeTryOnEventsInRange(workspaceId, sinceIso, untilIso),
    getChatEventsInRange(workspaceId, sinceIso, untilIso),
  ]);

  const dayBuckets = new Map<string, { sessions: number; cartValue: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dayBuckets.set(dayKey(d.toISOString()), { sessions: 0, cartValue: 0 });
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
    date: new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    sessions: v.sessions,
    cartValue: round2(v.cartValue),
  }));

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
    const totalPreviews = realtimeTryOnEvents.length;
    const totalSeconds = realtimeTryOnEvents.reduce((sum, event) => sum + event.durationSeconds, 0);

    const productCounts = new Map<string, { name: string; previews: number }>();
    for (const event of realtimeTryOnEvents) {
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
        addToCartRate: pctChange(current.addToCartRate, previous.addToCartRate),
      },
    },
    activityByDay,
    funnel: [
      { label: "Widget Opens", value: current.sessions },
      { label: "Added to Cart", value: current.sessionsWithAdds },
    ],
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
