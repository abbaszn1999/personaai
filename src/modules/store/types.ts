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

/**
 * Where the catalog is in the enrich-and-embed pipeline. This is distinct from
 * `StoreConnectionStatus`: credentials can be `connected` long before any
 * product is searchable by the agent.
 */
export type CatalogIndexStatus = "idle" | "pending" | "indexing" | "ready" | "error";

export interface CatalogSyncState {
  status: CatalogIndexStatus;
  /** Products embedded so far. Meaningless until `total` is known. */
  progress: number;
  /** 0 until the catalog walk has counted the store. */
  total: number;
}

/** A category/collection available on the connected store. */
export interface StoreCategory {
  id: string;
  name: string;
  /** Includes products in descendant categories, which is what a merchant selecting a parent is
   *  choosing. Both platforms report it this way. */
  productCount: number;
  /** Parent category id, or null for a top-level category. Only WooCommerce has a hierarchy;
   *  Shopify collections are flat and always report null. Selection is offered at the top level
   *  only, and choosing a parent pulls in everything beneath it. */
  parentId?: string | null;
  /** The merchant's raw label mapped onto the canonical taxonomy at sync time, so
   *  "Sneakers", "Trainers" and "Footwear" all resolve to one queryable value. Absent
   *  when the label couldn't be mapped confidently. */
  canonicalCategory?: string;
  canonicalSubcategory?: string;
}

/** One row of the mapping preview: the raw fields pulled from the merchant's store next to the
 *  exact ACS payload the mapper produces for it. Deliberately loose (`Record<string, unknown>`)
 *  rather than importing the server-side ACS product schema here — this is a read-only display
 *  shape for a modal, not a type this module needs to construct or validate. */
export interface MappingPreviewSample {
  raw: Record<string, unknown>;
  mapped: Record<string, unknown>;
}

export interface AcsMappingState {
  approved: boolean;
  mapperVersion: number;
}
