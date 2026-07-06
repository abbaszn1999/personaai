import { MOCK_WEARABLE_PRODUCTS, MOCK_UNWEARABLE_PRODUCTS } from "@/lib/mock-api/catalog";

export type DateRange = "7d" | "30d" | "90d";

/* ─── KPI Summary ──────────────────────────────────────────────────────── */

export const ANALYTICS_SUMMARY: Record<
  DateRange,
  {
    revenue: number;
    orders: number;
    aov: number;
    sessions: number;
    conversionRate: number;
    trends: {
      revenue: number;
      orders: number;
      aov: number;
      sessions: number;
      conversionRate: number;
    };
  }
> = {
  "7d": {
    revenue: 2840,
    orders: 41,
    aov: 69.27,
    sessions: 287,
    conversionRate: 14.3,
    trends: { revenue: 12.4, orders: 8.1, aov: 3.9, sessions: 21.0, conversionRate: -1.2 },
  },
  "30d": {
    revenue: 12450,
    orders: 187,
    aov: 66.58,
    sessions: 1243,
    conversionRate: 15.1,
    trends: { revenue: 18.7, orders: 14.2, aov: 4.1, sessions: 31.5, conversionRate: 2.3 },
  },
  "90d": {
    revenue: 38200,
    orders: 571,
    aov: 66.9,
    sessions: 3890,
    conversionRate: 14.7,
    trends: { revenue: 34.2, orders: 29.8, aov: 3.3, sessions: 48.1, conversionRate: 1.8 },
  },
};

/* ─── Sales Chart Data ─────────────────────────────────────────────────── */

function makeDailyData(days: number, baseRevenue: number, baseOrders: number) {
  const data = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const jitter = 0.6 + Math.random() * 0.8;
    const weekendBoost = [0, 6].includes(d.getDay()) ? 1.35 : 1;
    data.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      revenue: Math.round(baseRevenue * jitter * weekendBoost),
      orders: Math.round(baseOrders * jitter * weekendBoost),
    });
  }
  return data;
}

export const SALES_CHART_DATA: Record<
  DateRange,
  Array<{ date: string; revenue: number; orders: number }>
> = {
  "7d":  makeDailyData(7,  406, 5.9),
  "30d": makeDailyData(30, 415, 6.2),
  "90d": makeDailyData(90, 424, 6.3),
};

/* ─── Conversion Funnel ────────────────────────────────────────────────── */

export const FUNNEL_DATA: Record<
  DateRange,
  Array<{ label: string; value: number; dropOff: number }>
> = {
  "7d": [
    { label: "Widget Opens",  value: 287, dropOff: 0 },
    { label: "Product Views", value: 198, dropOff: 31 },
    { label: "Add to Cart",   value: 74,  dropOff: 63 },
    { label: "Purchase",      value: 41,  dropOff: 45 },
  ],
  "30d": [
    { label: "Widget Opens",  value: 1243, dropOff: 0 },
    { label: "Product Views", value: 847,  dropOff: 32 },
    { label: "Add to Cart",   value: 312,  dropOff: 63 },
    { label: "Purchase",      value: 187,  dropOff: 40 },
  ],
  "90d": [
    { label: "Widget Opens",  value: 3890, dropOff: 0 },
    { label: "Product Views", value: 2640, dropOff: 32 },
    { label: "Add to Cart",   value: 968,  dropOff: 63 },
    { label: "Purchase",      value: 571,  dropOff: 41 },
  ],
};

/* ─── Per-workspace analytics ──────────────────────────────────────────── */

export const WORKSPACE_ANALYTICS: Record<
  string,
  {
    name: string;
    mode: "wearable" | "unwearable";
    sessions: number;
    conversions: number;
    revenue: number;
    tryOns?: number;
    chatMessages?: number;
    avgSessionDurationSeconds: number;
  }
> = {
  "ws-001": {
    name: "Fashion Store",
    mode: "wearable",
    sessions: 712,
    conversions: 108,
    revenue: 7340,
    tryOns: 634,
    avgSessionDurationSeconds: 187,
  },
  "ws-002": {
    name: "Electronics Hub",
    mode: "unwearable",
    sessions: 531,
    conversions: 79,
    revenue: 5110,
    chatMessages: 2843,
    avgSessionDurationSeconds: 143,
  },
};

/* ─── Top Products ─────────────────────────────────────────────────────── */

const allProducts = [...MOCK_WEARABLE_PRODUCTS, ...MOCK_UNWEARABLE_PRODUCTS];

export const TOP_PRODUCTS = [
  { productId: "p-w-001", recommendations: 312, conversions: 89, conversionRate: 28.5 },
  { productId: "p-u-001", recommendations: 287, conversions: 71, conversionRate: 24.7 },
  { productId: "p-w-002", recommendations: 241, conversions: 54, conversionRate: 22.4 },
  { productId: "p-w-003", recommendations: 198, conversions: 61, conversionRate: 30.8 },
  { productId: "p-u-002", recommendations: 176, conversions: 18, conversionRate: 10.2 },
].map((row) => {
  const product = allProducts.find((p) => p.id === row.productId);
  return {
    ...row,
    name: product?.name ?? row.productId,
    imageUrl: product?.imageUrl ?? "",
    price: product?.price ?? 0,
    currency: product?.currency ?? "USD",
  };
});

/* ─── Virtual Try-On Insights ──────────────────────────────────────────── */

export const TRY_ON_INSIGHTS = {
  avgTryOnsPerSession: 2.3,
  mostTriedOnProducts: [
    { name: "Floral Wrap Dress",   tryOns: 287 },
    { name: "Classic Oxford Shirt", tryOns: 214 },
    { name: "White Sneakers",       tryOns: 133 },
  ],
  topRecommendedSizes: [
    { size: "S",  count: 198, percentage: 31 },
    { size: "M",  count: 243, percentage: 38 },
    { size: "L",  count: 141, percentage: 22 },
    { size: "XS", count: 57,  percentage:  9 },
  ],
};

/* ─── Shopping Assistant Insights ──────────────────────────────────────── */

export const ASSISTANT_INSIGHTS = {
  avgMessagesPerConversion: 6.4,
  topTopics: [
    { topic: "Product comparison", count: 341, percentage: 28 },
    { topic: "Price & deals",      count: 287, percentage: 23 },
    { topic: "Compatibility",      count: 214, percentage: 17 },
    { topic: "Specifications",     count: 176, percentage: 14 },
    { topic: "Warranty & returns", count: 119, percentage:  9 },
    { topic: "Other",              count: 112, percentage:  9 },
  ],
};

/* ─── Shopper Retention ────────────────────────────────────────────────── */

export const SHOPPER_STATS: Record<
  DateRange,
  {
    newShoppers: number;
    returningShoppers: number;
    avgSessionDurationSeconds: number;
  }
> = {
  "7d":  { newShoppers: 198, returningShoppers: 89,  avgSessionDurationSeconds: 164 },
  "30d": { newShoppers: 847, returningShoppers: 396, avgSessionDurationSeconds: 171 },
  "90d": { newShoppers: 2640, returningShoppers: 1250, avgSessionDurationSeconds: 168 },
};
