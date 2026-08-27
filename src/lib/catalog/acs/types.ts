/**
 * Subset of the AI Commerce Search (Retail API v2) `Product` schema this app actually populates.
 * Field names and shapes are taken directly from the REST reference
 * (https://cloud.google.com/retail/docs/reference/rest/v2/projects.locations.catalogs.branches.products)
 * — every key here must match ACS's own casing exactly, since there is no declarative mapping
 * layer on ACS's side (see the plan's "Is a column/field mapping step actually required?").
 */

export type AcsAvailability = "IN_STOCK" | "OUT_OF_STOCK" | "PREORDER" | "BACKORDER";

export type AcsProductType = "PRIMARY" | "VARIANT" | "COLLECTION";

export interface AcsPriceInfo {
  currencyCode: string;
  price: number;
  originalPrice?: number;
}

export interface AcsImage {
  uri: string;
  height?: number;
  width?: number;
}

export interface AcsColorInfo {
  colorFamilies?: string[];
  colors?: string[];
}

/** ACS's custom-attribute map. Every entry must pick exactly one of `text` or `numbers` — never
 *  both — plus explicit `searchable`/`indexable` flags, which ACS does not default sensibly for
 *  you (see the plan's mapper notes). */
export interface AcsCustomAttribute {
  text?: string[];
  numbers?: number[];
  searchable?: boolean;
  indexable?: boolean;
}

export interface AcsProduct {
  /** `projects/{p}/locations/{l}/catalogs/{c}/branches/{b}/products/{id}` once written; the
   *  mapper only ever produces the bare `id`, and the client fills in the full resource name at
   *  call time. */
  id: string;
  type?: AcsProductType;
  primaryProductId?: string;
  title: string;
  /** Flat "Root > ... > Leaf" strings, most-granular path only — never a structured array of
   *  ancestors. Required in practice for `PRIMARY` products (empty throws INVALID_ARGUMENT). */
  categories: string[];
  description?: string;
  brands?: string[];
  priceInfo?: AcsPriceInfo;
  availability?: AcsAvailability;
  images?: AcsImage[];
  uri?: string;
  colorInfo?: AcsColorInfo;
  sizes?: string[];
  materials?: string[];
  patterns?: string[];
  genders?: string[];
  ageGroups?: string[];
  gtin?: string;
  attributes?: Record<string, AcsCustomAttribute>;
}

export interface AcsImportRequestBody {
  inputConfig: {
    productInlineSource: {
      products: AcsProduct[];
    };
  };
  /** INCREMENTAL adds/updates only; FULL diffs and removes anything absent from this batch —
   *  never used with merchant-scoped batches since it would delete every other merchant's rows
   *  it doesn't happen to include. */
  reconciliationMode?: "INCREMENTAL" | "FULL";
  notificationPubsubTopic?: string;
}

/** What `products:import` returns, and what polling its `name` returns once complete. ACS reports
 *  per-product rejections in `response.errorSamples` while still calling the operation a success,
 *  so `error` being absent is not on its own evidence that anything was indexed. */
export interface AcsOperation {
  name?: string;
  done?: boolean;
  error?: { code?: number; message?: string };
  response?: {
    errorSamples?: { code?: number; message?: string }[];
  };
}

export interface AcsSearchRequest {
  placement: string;
  visitorId: string;
  query?: string;
  pageSize?: number;
  /** A string expression, e.g. `(availability: ANY("IN_STOCK")) AND (attributes.merchant_id: ANY("conn-123"))` —
   *  never optional in this app, since the merchant_id clause is the entire tenant-isolation
   *  boundary (see the plan's isolation model). */
  filter: string;
  pageCategories?: string[];
  boostSpec?: unknown;
  facetSpecs?: unknown[];
  pageToken?: string;
  /** Defaults to `DISABLED` server-side, which makes every extra word in a query strictly
   *  narrowing — see `QUERY_EXPANSION_SPEC` in client.ts for why this app can never leave it
   *  unset. */
  queryExpansionSpec?: { condition: "AUTO" | "DISABLED"; pinUnexpandedResults?: boolean };
}

export interface AcsSearchResultItem {
  id: string;
  product: AcsProduct;
  matchingVariantCount?: number;
  matchingVariantFields?: Record<string, string>;
}

export interface AcsSearchResponse {
  results?: AcsSearchResultItem[];
  totalSize?: number;
  attributionToken?: string;
  nextPageToken?: string;
}

/**
 * Subset of the Retail API v2 `UserEvent` schema this app writes — field names/casing taken
 * directly from the REST reference (https://cloud.google.com/retail/docs/reference/rest/v2/
 * projects.locations.catalogs.userEvents), same rule as `AcsProduct`.
 */
export type AcsUserEventType =
  | "search"
  | "detail-page-view"
  | "add-to-cart"
  | "remove-from-cart"
  | "purchase-complete"
  | "home-page-view"
  | "category-page-view"
  | "shopping-cart-page-view";

/** Only the override fields ACS actually reads off `product` in a `ProductDetail` — `id` is
 *  required, everything else is looked up from the catalog by that id. */
export interface AcsUserEventProduct {
  id: string;
}

export interface AcsProductDetail {
  product: AcsUserEventProduct;
  /** Required for `add-to-cart` and `purchase-complete`; omitted otherwise. */
  quantity?: number;
}

export interface AcsUserEvent {
  eventType: AcsUserEventType;
  visitorId: string;
  eventTime?: string;
  attributionToken?: string;
  productDetails?: AcsProductDetail[];
  /** Required (with/instead of `pageCategories`) for `search` events. */
  searchQuery?: string;
  filter?: string;
}
