import type { StoreConnection } from "@/modules/store/types";

export const MOCK_CONNECTIONS: StoreConnection[] = [
  {
    id: "conn-001",
    platform: "shopify",
    storeName: "TrendWear",
    storeUrl: "trendwear.myshopify.com",
    status: "connected",
    connectedAt: "2026-06-15T10:00:00Z",
  },
];

export const PLATFORM_DOCS: Record<string, string> = {
  shopify:     "https://shopify.dev/docs/api/admin-rest",
  woocommerce: "https://woocommerce.github.io/woocommerce-rest-api-docs/",
  wordpress:   "https://developer.wordpress.org/rest-api/",
  custom:      "https://docs.shopagent.io/custom-api",
};

export const PLATFORM_API_LABEL: Record<string, string> = {
  shopify:     "Admin API Key",
  woocommerce: "Consumer Key",
  wordpress:   "Application Password",
  custom:      "API Key",
};
