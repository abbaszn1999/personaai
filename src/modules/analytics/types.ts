export type DateRange = "7d" | "30d" | "90d";

export type OrderTrackingStatus = "active" | "missing" | "unknown" | "not_connected";

export type SalesMatchMethod = "line_tag" | "device_match";

export interface PersonaSalesPayload {
  orderTracking: OrderTrackingStatus;
  netUsdCents: number;
  grossUsdCents: number;
  refundsUsdCents: number;
  refundRate: number;
  orders: number;
  avgOrderUsdCents: number;
  conversionRate: number;
  billableNetUsdCents: number;
  commissionUsdCents: number;
  unbilledNetUsdCents: number;
  spendUsdCents: number | null;
  roi: number | null;
  byMethod: Record<SalesMatchMethod, { netUsdCents: number; orders: number }>;
  topProducts: Array<{ key: string; name: string; orders: number; netUsdCents: number }>;
  previous: { netUsdCents: number; orders: number; conversionRate: number; avgOrderUsdCents: number };
}

/** Mirrors WorkspaceAnalyticsPayload in src/lib/db/analytics.ts — duplicated here (rather than
 *  imported) so client components never pull in that server-only module (it imports the
 *  Supabase service-role client). Every field is Persona-attributed: something the widget
 *  itself directly caused, never store-wide order data. */
export interface WorkspaceAnalyticsPayload {
  kpis: {
    sessions: number;
    cartItemsAdded: number;
    cartValueAdded: number;
    currency: string;
    addToCartRate: number;
    avgCartItemValue: number;
    /** addToCartRate is a change in percentage points; the rest are percent changes. */
    trends: { sessions: number; cartItemsAdded: number; cartValueAdded: number; addToCartRate: number };
  };
  activityByDay: Array<{ date: string; sessions: number; cartValue: number; salesUsd: number }>;
  funnel: Array<{ label: string; value: number }>;
  sales: PersonaSalesPayload;
  topProducts: Array<{ productId: string; name: string; addCount: number; addValue: number }>;
  shopperStats: { newSessions: number; returningSessions: number; avgSessionDurationSeconds: number };
  imagesGenerated: number;
  tryOnInsights: {
    avgTryOnsPerSession: number;
    mostTriedOnProducts: Array<{ productId: string; name: string; tryOns: number }>;
    topRecommendedSizes: Array<{ size: string; count: number; percentage: number }>;
  } | null;
  liveTryOnInsights: {
    totalSessions: number;
    totalPreviews: number;
    avgPreviewsPerSession: number;
    totalSeconds: number;
    avgSessionDurationSeconds: number;
    mostPreviewedProducts: Array<{ productId: string; name: string; previews: number }>;
  } | null;
  assistantInsights: {
    totalMessages: number;
    avgMessagesPerSession: number;
    topTopics: Array<{ topic: string; count: number }>;
  } | null;
}
