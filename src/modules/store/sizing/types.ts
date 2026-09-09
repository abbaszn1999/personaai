/**
 * Data contract for the size-intelligence surface.
 *
 * Ported from the demo frontend, minus everything Persona already models. Field mapping types are
 * gone because Stage 1 reuses the existing read-only mapping preview; store-connection and
 * Shopify-tree types are gone because `StoreConnection` already covers the former and there is no
 * tree builder.
 *
 * Every shape here is currently fed by `./mocks`. The sizing agents described in
 * `Documentation/persona_sizing.md` do not exist yet, so nothing in this file is persisted.
 */

/** Setup pipeline stages, 1-indexed to match the merchant-facing step numbers.
 *
 *  Six values are kept while the pipeline shows five: doc Part 4 folded Gap Filling into Stage 4 as
 *  a modal, and doc Part 7's Chart Assignment takes the vacated slot in the next phase. Narrowing
 *  to five now would mean widening it again immediately. */
export type StageNumber = 1 | 2 | 3 | 4 | 5 | 6;

/** The last stage the pipeline currently renders. One constant rather than a literal in each of the
 *  three places that compared against it, which is how the stepper and the footer last disagreed. */
export const LAST_STAGE = 5 satisfies StageNumber;

/**
 * How a product's brand resolved during discovery.
 * - `global`   a recognizable brand with a findable public size chart -> web search queue
 * - `private`  a store's own label, no public chart exists -> manual fill
 * - `null`     no brand identified at all -> manual fill, grouped by category
 */
export type BrandType = "global" | "private" | "null";

export type CategoryType =
  | "tops"
  | "bottoms"
  | "footwear"
  | "headwear"
  | "outerwear"
  | "dresses"
  | "accessories";

/**
 * A category as the merchant's own store defines it. Children are recursive rather than a fixed
 * group/subgroup/leaf triple: WooCommerce lets merchants nest as deep as they like, and both
 * `resolveCategoryPaths` and `expandCategorySelection` already walk arbitrary depth. Shopify
 * collections arrive flat, so every node is a root with no children.
 */
export interface CategoryNode {
  id: string;
  name: string;
  /** Includes descendants, which is what both platforms report. */
  productCount: number;
  children: CategoryNode[];
}

export interface SizingProduct {
  id: string;
  sku: string;
  title: string;
  price: string;
  brand: string;
  brandType: BrandType;
  category: string;
  subCategory: string;
  sizes: string[];
  description: string;
  imageUrl: string;
  stockQty: number;
  availability: "in_stock" | "low_stock" | "out_of_stock";
}

export interface FoundSizeChart {
  id: string;
  brand: string;
  /** Merchant category paths this chart covers, e.g. "Women > Tops". */
  categories: string[];
  skuCount?: number;
  region: string;
  confidence: number;
  lastUpdated: string;
  headers: string[];
  rows: Record<string, string>[];
  /** Set during a delta sync when the chart was already resolved during initial setup. */
  isInheritedFromSetup?: boolean;
  inheritedFromSetupLabel?: string;
  sourceOrigin?: "setup_cached" | "delta_researched";
  isResearched?: boolean;
  researchStatus?: "done" | "needs_research";
}

export type GapStatus = "not_started" | "in_progress" | "complete";

/** A brand+category combination with no chart behind it, awaiting a hand-filled size matrix. */
export interface GapItem {
  id: string;
  brandName: string;
  categoryPath: string;
  title: string;
  type: "brand" | "category";
  categoryType: Exclude<CategoryType, "headwear" | "dresses">;
  skuCount: number;
  status: GapStatus;
  sampleProducts: {
    sku: string;
    title: string;
    imageUrl: string;
    price: string;
  }[];
  columns: string[];
  rows: Record<string, string>[];
  isInheritedFromSetup?: boolean;
  inheritedFromSetupLabel?: string;
  inheritedSetupDate?: string;
  sourceOrigin?: "setup_prefilled" | "delta_gap_required";
}

export interface BrandFilterOverride {
  increaseCm?: number;
  decreaseCm?: number;
}

/**
 * Per-category tolerance applied by the exclusion filter. Widens each size's chart range before
 * checking a shopper against it, so borderline items are not dropped before Persona sees them.
 * Never mutates the underlying chart.
 */
export interface CategoryFilterConfig {
  id: string;
  name: string;
  categoryPath: string;
  iconName: string;
  categoryType: CategoryType;
  defaultIncreaseCm: number;
  defaultDecreaseCm: number;
  skuCount: number;
  sampleMeasurement: string;
  sampleBaseRange: { min: number; max: number; unit: string; sizeLabel: string };
  brands: {
    name: string;
    brandType: BrandType;
    skuCount: number;
    fitNote?: string;
  }[];
  brandOverrides: Record<string, BrandFilterOverride>;
}

export interface SyncHistoryEntry {
  id: string;
  timestamp: string;
  relativeTime: string;
  itemsCount: number;
  triggerType:
    | "Shopify Webhook"
    | "WooCommerce Webhook"
    | "Manual Dashboard"
    | "Scheduled Nightly Cron"
    | "Initial Onboarding";
  status: "Completed" | "Success";
  cachedBrandsCount: number;
  newBrandsResearched: number;
  gapsFilled: number;
  durationSec: number;
  notes: string;
  sampleItems: string[];
}

/** One brand+category row in a delta sync, and where its chart is coming from. */
export interface SyncResearchTarget {
  id: string;
  brand: string;
  brandType: BrandType;
  category: string;
  skuCount: number;
  status: "cached" | "researched" | "needs_gap_fill";
  statusLabel: string;
  source: string;
  confidence: number;
  chartId?: string;
  gapId?: string;
}
