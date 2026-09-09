/**
 * The wire contract between the sizing API routes and the pipeline UI.
 *
 * Separate from `./types.ts` on purpose: that file holds the demo-derived display shapes still fed by
 * `./mocks`, and mixing the two would make it impossible to tell at a glance which stages are real.
 * Everything here is produced by a server route and is safe to trust.
 *
 * Declared rather than imported from the server modules because these are client types — importing
 * `lib/db/*` from a component would pull the Supabase server client into the browser bundle.
 */

// The one exception, and it does not breach that rule: `chart-schema` is a pure module with no
// Supabase import, and this is a type-only import that is erased before bundling. Re-declaring
// `SizeChartRow` here would mean two definitions of the row shape that the whole filter depends on.
import type { SizeChartRow } from "@/lib/sizing/chart-schema";

export type SizingRunStatus = "pending" | "running" | "blocked" | "complete" | "failed";
export type SizingRunStage = "scan" | "classify" | "research" | "gap_fill" | "resolve" | "publish";

/** How a brand routes after classification. `none` (no brand at all) is deliberately distinct from
 *  `unclassified` (not yet decided) — the first goes to manual fill, the second to nothing yet. */
export type ServerBrandType = "unclassified" | "global" | "private" | "none";

export interface SizingRun {
  id: string;
  connectionId: string;
  kind: "setup" | "delta";
  status: SizingRunStatus;
  stage: SizingRunStage;
  productsScanned: number;
  error: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoverageBrand {
  brandKey: string;
  name: string | null;
  brandType: ServerBrandType;
  skuCount: number;
  share: number;
  sizingCategories: string[];
  rawFormatCount: number;
}

export interface CoverageCategory {
  key: string;
  label: string;
  skuCount: number;
  brandCount: number;
  measurements: string[];
}

export interface CoverageSummary {
  totalSkus: number;
  chartsNeeded: number;
  brands: CoverageBrand[];
  categories: CoverageCategory[];
  counts: Record<ServerBrandType, number>;
}

/** Tab 2's output in the doc's exact shape. Brands appear once as unique names; only the null case
 *  is row-level, because an unbranded product has no brand name to group under. */
export interface BrandIdentification {
  global_brands: string[];
  private_brands: string[];
  null_records: string[];
}

export interface RoutingDestination {
  brands: string[];
  /** One per (brand x sizing category) — the real unit of work. A brand count understates it, since
   *  one brand carried in five categories needs five charts. */
  charts: number;
  skuCount: number;
}

export interface NullGroup {
  sizingCategory: string;
  label: string;
  productCount: number;
}

/** Tab 3. Pure deterministic routing of Tab 2's lists — no agent involved. */
export interface RoutingPlan {
  webSearch: RoutingDestination;
  manualFillBrands: RoutingDestination;
  manualFillNulls: RoutingDestination & { groups: NullGroup[] };
  /** Not a destination: an unclassified brand is not yet routable, and defaulting it into a queue
   *  costs either a wasted paid search or a merchant hand-typing a chart that already exists. */
  unclassified: RoutingDestination;
}

export interface SizingRunResponse {
  run: SizingRun | null;
  summary: CoverageSummary;
  identification: BrandIdentification;
  routing: RoutingPlan;
  mappingApproved: boolean;
}

// ─── Stage 4: researched charts and the gaps between them ─────────────────────

/** Why a (brand x sizing category) does or does not have a chart. Mirrors `research_status` on
 *  `sizing_coverage` — `pending` covers both "no research pass yet" and the private/unbranded rows
 *  that are never researched at all. */
export type ResearchStatus = "pending" | "found" | "not_found" | "not_covered" | "failed";

export type ChartQualityCode = "no_bounds" | "point_bounds" | "mixed_scales" | "too_few_rows" | "no_source";

/** A defect found in the chart itself, independently of the model's own `confidence`. */
export interface ChartQualityFlag {
  code: ChartQualityCode;
  severity: "error" | "warning";
  label: string;
  detail: string;
}

/** Who a published size table is for, read off the brand's own guide page. Mirrors `AUDIENCES` in
 *  `lib/sizing/keys.ts`. */
export type ChartAudience = "mens" | "womens" | "boys" | "girls" | "kids" | "unisex";

/**
 * One stored chart, ready to render.
 *
 * `headers`/`rows` are display strings built server-side from the flat `<measurement>_min/_max`
 * rows plus the row's label aliases, so the table and the modal need no knowledge of the
 * measurement vocabulary — and so the mock-fed sync views and this real data can share one modal.
 *
 * Several of these share one `(brandKey, sizingCategory)` by design — doc Part 5 has a brand
 * publishing however many chart variants it publishes, and research discovering them rather than
 * fitting them to a list. `variantName` is what tells them apart and what Phase 5's dropdown offers.
 */
export interface ResearchedChart {
  id: string;
  brand: string;
  brandKey: string;
  /** The raw sizing key — a bare garment group, e.g. `tops`. Shown verbatim: a friendly label would
   *  hide exactly the kind of miscategorisation this screen exists to catch. */
  sizingCategory: string;
  /** Doc Part 5. Which of the brand's chart lines this is — `Men`, `Women Petite`, `Tommy Jeans
   *  Men`. Free-form: research discovers the brand's real variants rather than fitting them to a
   *  fixed list every brand must satisfy. */
  variantName: string;
  audience: ChartAudience;
  /** The source table's verbatim heading, e.g. `TOMMY JEANS SIZES — DRESSES`. Provenance rather than
   *  identity — it says which page the variant was transcribed from. */
  sourceTitle: string;
  skuCount: number;
  region: string;
  /** 0-100, to match the demo display scale. Stored 0-1. */
  confidence: number;
  lastUpdated: string;
  sourceUrl: string | null;
  provenance: "research" | "manual" | "merchant";
  /** True for the shared cross-merchant row (`connection_id is null`) rather than this store's own. */
  shared: boolean;
  headers: string[];
  rows: Record<string, string>[];
  /** The stored measurement rows behind the display `rows`, so Make Template can fork a copy
   *  without re-parsing formatted strings. */
  chartRows: SizeChartRow[];
  quality: ChartQualityFlag[];
  /** Whether a merchant should check this chart before it drives recommendations. Decided on the
   *  server so there is one confidence bar in the system rather than one per component. */
  needsReview: boolean;
}

/** A (brand x sizing category) with no chart behind it, and the reason why. */
export interface ChartGap {
  id: string;
  brandKey: string;
  brandName: string;
  brandType: ServerBrandType;
  sizingCategory: string;
  skuCount: number;
  storeCategoryPaths: string[][];
  researchStatus: ResearchStatus;
  researchNote: string | null;
  /** Status and brand type already resolved into one phrase, so the table doesn't re-derive it. */
  reason: string;
  sampleSkus: { sku: string | null; title: string; imageUrl: string | null }[];
}

export interface SizingChartsResponse {
  charts: ResearchedChart[];
  /** Global brands whose research produced nothing, plus every private label — both route to manual
   *  fill per doc Tab 3, which is why one tab holds them together. */
  notFound: ChartGap[];
  /** The unbranded sentinel's rows, grouped by category rather than brand. */
  noBrand: ChartGap[];
  totals: {
    chartsFound: number;
    brandsCharted: number;
    chartedSkus: number;
    /** Every (brand x sizing category) needing a chart — charted or not. */
    pairsNeeded: number;
    gapSkus: number;
  };
  /** False until a research pass has recorded an outcome anywhere, which is what separates "no gaps"
   *  from "nothing has run yet" — two states that otherwise render as the same empty table. */
  researched: boolean;
}

export const EMPTY_CHARTS_RESPONSE: SizingChartsResponse = {
  charts: [],
  notFound: [],
  noBrand: [],
  totals: { chartsFound: 0, brandsCharted: 0, chartedSkus: 0, pairsNeeded: 0, gapSkus: 0 },
  researched: false,
};

export interface SizingSampleRow {
  externalId: string;
  sku: string | null;
  title: string;
  description: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  inStock: boolean;
  brand: string | null;
  brandType: ServerBrandType;
  /** The parent this product is sized on, already including any Stage 2 correction — what the scan
   *  will actually use. */
  sizingCategory: string | null;
  sizingCategoryLabel: string | null;
  /** What the category mapping alone gives it. Differs from `sizingCategory` only where the merchant
   *  corrected this product, which is how the row can say so instead of presenting a hand-made
   *  choice as though the path produced it. */
  inheritedCategory: string | null;
  sizes: string[];
  rawFormat: string | null;
  storeCategoryPath: string[];
}

export interface SizingSampleResponse {
  rows: SizingSampleRow[];
  /** Opaque position of the next page, null at the end of the selection. Never computed by the
   *  client: Shopify pages by cursor, so there is no arithmetic that turns page 3 into page 4. */
  nextCursor: string | null;
  pageSize: number;
  /** Products across the whole selection. Null when the request didn't ask for a count, which is
   *  every page turn after the first — the total doesn't change as you flip through. */
  total: number | null;
  /** False when the total had to be summed across category groups and so double-counts products
   *  filed in more than one. Drives whether the UI says "600" or "about 600". */
  totalExact: boolean | null;
  /** What each filter chip counts, or null before a scan has classified anything. `global`,
   *  `private` and `unclassified` count distinct brands; `none` (no brand at all) counts products,
   *  since there is no brand name to count instead. Neither kind sums to `total`. */
  typeCounts: Record<ServerBrandType, number> | null;
  /** True when the server applied a brand-type or search filter to this page. */
  filtering: boolean;
  scanned: boolean;
}

/** Page sizes stage 2 offers. Capped at 100 because that is WooCommerce's own `per_page` ceiling —
 *  anything larger would quietly become two store requests per page. */
export const SAMPLE_PAGE_SIZES = [25, 50, 100] as const;

export const EMPTY_COVERAGE_SUMMARY: CoverageSummary = {
  totalSkus: 0,
  chartsNeeded: 0,
  brands: [],
  categories: [],
  counts: { unclassified: 0, global: 0, private: 0, none: 0 },
};

export const EMPTY_IDENTIFICATION: BrandIdentification = {
  global_brands: [],
  private_brands: [],
  null_records: [],
};

const EMPTY_DESTINATION: RoutingDestination = { brands: [], charts: 0, skuCount: 0 };

export const EMPTY_ROUTING: RoutingPlan = {
  webSearch: EMPTY_DESTINATION,
  manualFillBrands: EMPTY_DESTINATION,
  manualFillNulls: { ...EMPTY_DESTINATION, groups: [] },
  unclassified: EMPTY_DESTINATION,
};

/** Statuses where a job is still working, so the UI should keep polling. `blocked` is excluded: it
 *  means the run is waiting on the merchant, and polling would never see it change on its own. */
export function isRunWorking(run: SizingRun | null): boolean {
  return run?.status === "pending" || run?.status === "running";
}

/**
 * True until the catalog scan and brand classification have both finished.
 *
 * Shared by stages 2 and 3 rather than re-tested in each. Both block on the same event — the scan is
 * what gives stage 2 its brand types and stage 3 its entire contents — so two copies of this
 * condition would eventually disagree and let a merchant onto a stage reading half-written data.
 */
export function isScanIncomplete(run: SizingRun | null): boolean {
  return !run || run.stage === "scan" || run.stage === "classify";
}
