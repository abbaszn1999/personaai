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
// Stage numbering lives in `./types.ts`, which imports nothing at all, so this direction is safe.
import { LAST_STAGE, type StageNumber } from "./types";

export type SizingRunStatus = "pending" | "running" | "blocked" | "complete" | "failed";
export type SizingRunStage =
  | "scan"
  | "classify"
  | "research"
  | "gap_fill"
  /** Stage 5's own stage, so a refresh returns to Chart Assignment. */
  | "assign"
  | "resolve"
  | "publish";

/** What the `scan` stage is doing inside itself. Null on every other stage, because no other stage is
 *  more than one thing. See `SIZING_RUN_PHASES` in `lib/db/sizing-runs` for why this exists. */
export type SizingRunPhase = "walking" | "aggregating";

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
  phase: SizingRunPhase | null;
  /** Units done within the phase, and what it expects in total. Either can be null: the walk has no
   *  denominator until it ends, and aggregation has no unit worth counting. */
  phaseDone: number | null;
  phaseTotal: number | null;
  /** Brands Stage 4 has been authorised to research, drained as each finishes. Empty means research is
   *  parked — it never starts on its own any more. */
  researchBrandKeys: string[];
  /** The brand a research tick is inside right now, so the queue can name it. Null between brands. */
  researchCurrentBrandKey: string | null;
  /** Whether the live request is a Regenerate rather than a first Generate. */
  researchForce: boolean;
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
  /** The merchant's own category paths behind this row, root-first. Populated only for the
   *  unbranded sentinel — see `CoverageBrand` in `lib/sizing/summary.ts`. */
  storeCategoryPaths: string[][];
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
  /** Regional scales this chart carries, pre-joined for display — `EU · UK · US`. Derived from the
   *  rows server-side; empty when the source published alpha labels only. */
  labelSystems: string;
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
  /** The Persona leaf keys this exact chart claims — see `coversLeaves` on the server-side
   *  `ResearchedChartResult` in `chart-results.ts`. */
  coversLeaves: string[];
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

/**
 * Where one global brand stands in Stage 4's queue. Mirrors `BrandResearchStatus` in
 * `lib/sizing/chart-results.ts`.
 *
 * `queued` and `researching` come from the run's persisted scope rather than from anything stored on
 * the brand, which is why the server has to compute them: the client cannot join a brand against a
 * research authorisation it never sees.
 */
export type BrandResearchStatus =
  | "pending"
  | "queued"
  | "researching"
  | "done"
  | "partial"
  | "not_found"
  | "failed";

/** One row of Stage 4's brand table — the grain the Generate button works on, since one web search
 *  covers every parent a brand publishes. */
export interface BrandResearchRow {
  brandKey: string;
  brandName: string;
  /** What the search runs on, where classification named the company behind a store's abbreviation.
   *  Shown so an empty result is explicable rather than mysterious. */
  searchName: string;
  status: BrandResearchStatus;
  skuCount: number;
  sizingCategories: string[];
  chartedCategories: number;
  chartCount: number;
  note: string | null;
}

export interface SizingChartsResponse {
  charts: ResearchedChart[];
  /** Global brands only. Private and unbranded rows keep their manual-fill tabs, because a web search
   *  cannot help either and offering Generate there would only waste a paid request. */
  brands: BrandResearchRow[];
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
  brands: [],
  notFound: [],
  noBrand: [],
  totals: { chartsFound: 0, brandsCharted: 0, chartedSkus: 0, pairsNeeded: 0, gapSkus: 0 },
  researched: false,
};

// ─── Stage 5: chart assignment (doc Part 7) ───────────────────────────────────

/** One chart a merchant path may be bound to. Mirrors `AssignableVariant` in `lib/sizing/assignments`. */
export interface AssignableVariant {
  chartId: string;
  variantName: string;
  audience: ChartAudience;
  /** The Persona leaf keys this exact chart claims — see `coversLeaves` on the server-side
   *  `AssignableVariant` in `assignments.ts`. */
  coversLeaves: string[];
  /** 0-100. */
  confidence: number;
  sourceTitle: string;
  sourceUrl: string | null;
  shared: boolean;
  needsReview: boolean;
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * One (brand x merchant category path x sizing parent) and the chart governing it.
 *
 * The path axis is what Stage 4 does not have: coverage keys on the sizing parent, so "Tommy tops"
 * cannot distinguish `Men > T-Shirts` from `Women > Tops` — and those two want different variants of
 * the same brand's chart.
 */
export interface PathAssignment {
  /** Derived from the natural key, because a path nobody has assigned yet has no row and so no id. */
  id: string;
  brandKey: string;
  brandName: string;
  brandType: ServerBrandType;
  categoryId: string;
  /** Breadcrumb, root first. */
  categoryPath: string[];
  sizingCategory: string;
  skuCount: number;
  /** Null with `decided` true is the merchant's explicit "no chart here". Null with `decided` false is
   *  a path nobody has answered — two states that must not render the same way. */
  variantName: string | null;
  decided: boolean;
  source: "merchant" | "auto" | null;
  /** Only the variants that may size this path's audience — an adult path is never offered a child's
   *  table. A stored choice is always included, even if the guard would now exclude it. */
  variants: AssignableVariant[];
  /** Read off the path's Persona department. Null for pre-Universal-Mapping rows, which state no
   *  audience and so are offered everything. */
  audience: ChartAudience | null;
  /** Variants the audience guard removed. Non-zero with an empty `variants` means the brand has charts
   *  for this parent but none for this audience — a Stage 4 coverage gap, not a missing research run. */
  variantsOtherAudience: number;
  /** The stored name matches no current chart: research renamed or dropped the table the merchant
   *  chose. Shown rather than cleared, since their decision is still the best evidence of intent. */
  missingVariant: boolean;
}

export interface AssignmentTotals {
  paths: number;
  assigned: number;
  assignedSkus: number;
  /** Paths nobody has answered. An explicit no-chart decision is not counted here. */
  unresolved: number;
  unresolvedSkus: number;
  skipped: number;
}

export interface SizingAssignmentsResponse {
  paths: PathAssignment[];
  totals: AssignmentTotals;
  /** How many paths this read resolved by itself — sole variants and unambiguous audience matches. */
  autoMatched: number;
  /** Every leaf enabled in this merchant's taxonomy scope — brand-agnostic and independent of
   *  `paths`' live SKU counts. See `mappedPersonaLeaves`. */
  mappedLeaves: string[];
}

export const EMPTY_ASSIGNMENT_TOTALS: AssignmentTotals = {
  paths: 0,
  assigned: 0,
  assignedSkus: 0,
  unresolved: 0,
  unresolvedSkus: 0,
  skipped: 0,
};

export interface SizingSampleRow {
  externalId: string;
  sku: string | null;
  title: string;
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
  /** Products across the whole selection, independent of any filter — what "All items" means. Null
   *  when the request didn't ask for a count, which is every page turn after the first: it doesn't
   *  change as you flip through, or when a filter is applied. */
  selectionTotal: number | null;
  /** False when the total had to be summed across category groups and so double-counts products
   *  filed in more than one. Drives whether the UI says "600" or "about 600". */
  selectionTotalExact: boolean | null;
  /** Exact number of products the active brand-type and/or parent filter matches, straight from
   *  coverage. Null when neither is on — a text search gets no such count without walking. */
  filteredTotal: number | null;
  /** What each brand chip's badge shows, or null before a scan has classified anything. Distinct
   *  brands for `global`, `private` and `unclassified`, because those chips are named after brands;
   *  items for `none`, which has no brand to count. */
  typeCounts: Record<ServerBrandType, number> | null;
  /** Items per brand type, on the same coverage basis — the unit a filter actually selects in, and so
   *  what the footer counts a filtered page against. */
  typeItemCounts: Record<ServerBrandType, number> | null;
  /** Products per parent sizing category, on the same basis. Keyed by `SizingGroup`. */
  parentCounts: Record<string, number> | null;
  /** True when the server applied a brand-type, parent or search filter to this page. */
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

export type BrandMappingStatus = "needs_mapping" | "rescanning" | "ready";

export interface CanonicalBrandGroup {
  canonicalKey: string;
  canonicalName: string;
  rawKeys: string[];
  shared: boolean;
}

export interface BrandMappingResponse {
  ready: boolean;
  status: BrandMappingStatus;
  confirmedAt: string | null;
  sourceFingerprint: string;
  brands: Array<{ rawKey: string; labels: string[]; skuCount: number; sizingCategories: string[] }>;
  groups: CanonicalBrandGroup[];
  targets: Array<{ canonicalKey: string; canonicalName: string; shared: boolean }>;
}

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

/**
 * The stage a returning merchant should land on, given the state of their run.
 *
 * The stepper's position is per-session UI, which is right — it is where you are looking, not a fact
 * about the store. What was wrong was where it *started*: at stage 1 on every reload, while the run
 * row said the catalog had been read and its brands classified. A merchant coming back to a run
 * parked at research was shown stage 1 with stages 2 and 3 marked untouched, and had to click
 * forward through work that was already finished and paid for — the exact thing `sizing_runs` was
 * added to prevent.
 *
 * Not a lookup of `run.stage`, because that names what the server is waiting to *do* next, not where
 * the merchant got to. The rule is: the screen where the run's pending action is taken.
 *
 */
export function stageForRun(run: SizingRun | null): StageNumber {
  if (!run) return 1;

  switch (run.stage) {
    // Stage 3 owns the scan's own progress screen (`isScanIncomplete` above is what swaps it in), so
    // it is where a scan still in flight is watched rather than stage 2.
    case "scan":
    case "classify":
      return 3;
    // Every research state now lands on stage 4, blocked included. It used to send a blocked run back
    // to stage 3, because leaving stage 3 was the authorization to spend on a bulk search. Stage 4
    // owns that decision per brand now, so `research`/`blocked` is not a pending decision on stage 3 —
    // it is the idle state of the brand queue, and stage 4 is where it is read.
    case "research":
    // Research is done and its gaps are filled from a modal on stage 4, so that is still the screen.
    case "gap_fill":
      return 4;
    case "assign":
      return 5;
    case "resolve":
    case "publish":
      return LAST_STAGE;
  }
}
