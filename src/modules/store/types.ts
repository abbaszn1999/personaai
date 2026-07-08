export type StorePlatform = "shopify" | "woocommerce" | "wordpress" | "custom";

export type StoreConnectionStatus = "connected" | "disconnected" | "pending" | "error";

export interface StoreConnection {
  id: string;
  platform: StorePlatform;
  storeName: string;
  storeUrl: string;
  status: StoreConnectionStatus;
  connectedAt: string | null;
}

/** A category/collection available on the connected store. */
export interface StoreCategory {
  id: string;
  name: string;
  productCount: number;
}
