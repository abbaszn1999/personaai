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
   *  Shopify collections are flat and always report null. Selection is offered at every level, and
   *  choosing a parent pulls in everything beneath it. */
  parentId?: string | null;
  /** The category's URL slug — a Shopify collection handle, a WooCommerce term slug. Unique per
   *  store where the display name is not: a store can carry ten sibling terms all called
   *  "Accessories", and this is the only thing that tells them apart on screen. */
  handle?: string;
  /** Shopify only. `custom` is a hand-picked list of products, `smart` is a saved rule. Worth
   *  surfacing because the rule-based ones are usually the store's real taxonomy while the
   *  hand-picked ones are as often a merchandising shelf. */
  collectionType?: "custom" | "smart";
  /** The merchant's raw label mapped onto the canonical taxonomy at sync time, so
   *  "Sneakers", "Trainers" and "Footwear" all resolve to one queryable value. Absent
   *  when the label couldn't be mapped confidently. */
  canonicalCategory?: string;
  canonicalSubcategory?: string;
}

/**
 * A hierarchy the merchant assembled by hand, for platforms that publish none of their own.
 *
 * WooCommerce terms carry a real parent id, so its tree is derived and this is never used. Shopify
 * collections are flat — "Women", "Dresses" and "Summer Sale" are peers with no links between them
 * — so the merchant drags them into Department > Subcategory > Leaf themselves. Three levels
 * because that is what a storefront's own navigation is, and what makes a path like
 * `Women > Dresses > Casual Dresses` readable in every screen downstream.
 *
 * The structure is scope and presentation only. Indexing walks the collection ids at the leaves,
 * and the sizing parent attaches to the collection, so nesting the same collection under two
 * departments is allowed and costs nothing.
 */
export interface MerchantTreeLeaf {
  /** Stable across renames and re-parents, which is why the parent map keys on the collection
   *  rather than on this. */
  id: string;
  name: string;
  /**
   * The store collection this leaf stands for, or `""` for one the merchant typed rather than
   * dragged.
   *
   * Empty string rather than null to match `UNKNOWN_BRAND_KEY`'s convention elsewhere in the
   * pipeline. A leaf with nothing behind it holds no products, so it can never enter scope and
   * never reaches the parent mapping — but it is still kept and stored, because a merchant who
   * sketched their structure before dragging collections into it should not watch that structure
   * disappear when they save.
   */
  collectionId: string;
  productCount: number;
}

export interface MerchantTreeSubGroup {
  id: string;
  name: string;
  /** A subcategory may itself be a real collection ("Dresses") or a heading the merchant typed
   *  with nothing behind it, in which case only its leaves hold products. */
  collectionId: string | null;
  leafs: MerchantTreeLeaf[];
}

export interface MerchantTreeNode {
  id: string;
  name: string;
  collectionId: string | null;
  subGroups: MerchantTreeSubGroup[];
}

/**
 * Categories step 2: which of the five parent sizing categories each in-scope path was mapped to.
 *
 * Keyed on the platform's own category id — a WooCommerce term id, a Shopify collection id — never
 * on a path string, so renaming a collection in the store admin cannot orphan the mapping. The
 * value is a `SizingGroup`, typed as a bare string here to keep this module free of a server
 * import; `isSizingGroup` is the guard on the way in.
 */
export type CategoryParentMap = Record<string, string>;

/**
 * Stage 2 corrections: which parent an individual product takes, overriding the one its category
 * path gives it.
 *
 * Keyed on the product's external id, and typed as a bare string value for the same reason as
 * `CategoryParentMap`. Meant to stay sparse — a path accumulating hundreds of these is telling you
 * the path itself is mapped wrong, or holds more than one kind of garment and wants splitting.
 */
export type SkuParentOverrides = Record<string, string>;

/** A single live product sampled from a category for the "preview products" modal on the
 *  Categories tab. Display-only — deliberately not the mapper's ACS payload, since this runs
 *  before a category is ever selected and has nothing to do with mapping approval. */
export interface CategorySampleProduct {
  externalId: string;
  title: string;
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  inStock: boolean;
  productUrl: string | null;
  sizes: string[];
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

/** Re-exported so client components reach the role vocabulary without importing
 *  `acs/field-overrides`, which pulls in `crypto`. */
export type { OptionRole, VariantRole } from "@/lib/catalog/option-groups";

/** One `variantOptions` group discovered on a live sample of the merchant's own catalog — a row in
 *  the Stage 1 mapping table's option-group section, where its destination is reassignable. */
export interface OptionGroupInfo {
  /** The group's name exactly as the store returns it — shown to the merchant. */
  name: string;
  /** Trim + lowercase of `name`, the key `acs_field_overrides.optionRoles` uses. */
  normalized: string;
  /** Where this group lands with no override, from the mapper's built-in name match. */
  defaultRole: import("@/lib/catalog/option-groups").OptionRole;
}

/** Client-side state for the Stage 1 option-group overrides. */
export interface FieldOverridesState {
  groups: OptionGroupInfo[];
  optionRoles: Record<string, import("@/lib/catalog/option-groups").VariantRole>;
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
}

/** Interpolated raw into the stylist's vision prompt (`style-bundle.md`) on every bundle turn,
 *  so this is the one guard between whatever a merchant pastes and a live LLM prompt. Shared
 *  between the API route (enforcement) and the editor UI (character counter) so the two never
 *  drift apart. */
export const STYLE_GUIDE_MAX_LENGTH = 1000;
