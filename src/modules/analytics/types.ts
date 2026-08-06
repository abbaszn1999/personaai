export type DateRange = "7d" | "30d" | "90d";

/** Mirrors WorkspaceAnalyticsPayload in src/lib/db/analytics.ts — duplicated here (rather than
 *  imported) so client components never pull in that server-only module (it imports the
 *  Supabase service-role client). Every field is Persona-attributed: something the widget
 *  itself directly caused, never store-wide WooCommerce data. */
export interface WorkspaceAnalyticsPayload {
  kpis: {
    sessions: number;
    cartItemsAdded: number;
    cartValueAdded: number;
    currency: string;
    addToCartRate: number;
    avgCartItemValue: number;
    trends: { sessions: number; cartItemsAdded: number; cartValueAdded: number; addToCartRate: number };
  };
  activityByDay: Array<{ date: string; sessions: number; cartValue: number }>;
  funnel: Array<{ label: string; value: number }>;
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
