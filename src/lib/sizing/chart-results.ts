import type { SizingChartRow } from "@/lib/db/sizing-charts";
import { formatLabelSystems, type SizeChartRow } from "./chart-schema";
import type { BrandType, ResearchStatus, SizingCoverageRow } from "@/lib/db/sizing-coverage";
import {
  assessChart,
  chartTable,
  CHART_CONFIDENCE_PERCENT,
  hasBlockingQualityIssue,
  type ChartQualityFlag,
} from "./chart-review";
import { isSizingCategory, UNKNOWN_BRAND_KEY, type Audience } from "./keys";
import { variantTags } from "./variant-match";

/**
 * Joins what the store carries (`sizing_coverage`) against what research produced
 * (`sizing_charts`) into Stage 4's review surface.
 *
 * Coverage is the driving side, not charts: the screen's job is to account for **every**
 * (brand x sizing category) the store needs, and listing charts alone would show six successes and
 * silently omit the forty-five pairs still waiting on one. Every coverage row therefore comes back
 * either as a chart or as a gap with a reason.
 *
 * Pure, so the whole join is testable without a database, and declared with its own interfaces per
 * this directory's convention — the client's mirror of these shapes lives in
 * `modules/store/sizing/server-types.ts`.
 */

export interface ResearchedChartResult {
  id: string;
  brand: string;
  brandKey: string;
  sizingCategory: string;
  /** Doc Part 5. Which of the brand's chart lines this is — `Men`, `Women Petite`. What Phase 5's
   *  dropdown offers, and what tells a brand's several charts for one parent apart. */
  variantName: string;
  /** Who the source table was published for, read off the brand's own guide page. */
  audience: Audience;
  /** The table's verbatim heading, so a merchant looking at three Tommy tops charts can tell the
   *  mainline one from the Tommy Jeans one without opening all three. */
  sourceTitle: string;
  skuCount: number;
  /** Which regional scales this chart can speak to — `EU · UK · US` — derived from the rows rather
   *  than stored, because one chart's rows carry several at once and a single stored value could only
   *  ever name one of them. Empty string when the source printed alpha labels only. */
  labelSystems: string;
  confidence: number;
  lastUpdated: string;
  sourceUrl: string | null;
  provenance: "research" | "manual" | "merchant";
  shared: boolean;
  headers: string[];
  rows: Record<string, string>[];
  /** The stored measurement rows behind `rows`, which are display strings. Sent so doc Part 6's
   *  Make Template can fork a merchant-owned copy without re-parsing `96-104` back out of the
   *  formatted table it just rendered. */
  chartRows: SizeChartRow[];
  quality: ChartQualityFlag[];
  /** The Persona leaf keys this exact chart claims — `sizing_charts.covers_leaves`. Shown so a
   *  merchant reviewing Stage 4 can see which sub-categories a chart is the authoritative answer
   *  for, the same fact Stage 5's auto-match reads via `chartsForLeaf`. */
  coversLeaves: string[];
  /**
   * Whether a merchant should look at this chart before it drives recommendations.
   *
   * Decided here rather than in the component so there is exactly one bar in the system. The UI
   * used to keep its own `REVIEW_THRESHOLD = 90` while research skipped re-searching anything above
   * 0.75, which left every chart in between both trusted and distrusted depending on which module
   * you asked.
   */
  needsReview: boolean;
}

export interface ChartGapResult {
  id: string;
  brandKey: string;
  brandName: string;
  brandType: BrandType;
  sizingCategory: string;
  skuCount: number;
  storeCategoryPaths: string[][];
  researchStatus: ResearchStatus;
  researchNote: string | null;
  reason: string;
  sampleSkus: { sku: string | null; title: string; imageUrl: string | null }[];
}

export interface ChartResults {
  charts: ResearchedChartResult[];
  notFound: ChartGapResult[];
  noBrand: ChartGapResult[];
  totals: {
    chartsFound: number;
    brandsCharted: number;
    chartedSkus: number;
    pairsNeeded: number;
    gapSkus: number;
  };
  researched: boolean;
}

/**
 * Where one global brand stands, as Stage 4's table shows it.
 *
 * Coverage is per (brand x sizing parent), but the merchant presses Generate per *brand* — one web
 * search covers every parent that brand publishes — so the screen needs a row at that grain. Derived
 * rather than stored: a status column on the brand would be a second answer that can disagree with
 * the coverage rows and charts it claims to summarise.
 */
export type BrandResearchStatus =
  /** No pass has touched it. The only state Generate is the obvious action from. */
  | "pending"
  /** In the run's authorised scope, waiting for a worker tick. */
  | "queued"
  /** The brand the worker is inside right now. */
  | "researching"
  /** Every parent this store carries the brand in has a chart. */
  | "done"
  /** Some parents charted, some not — a guide that covers tops but not the swimwear this store sells. */
  | "partial"
  /** Searched, and the brand publishes nothing findable. Routes to manual fill, not to a retry. */
  | "not_found"
  /** The call itself broke. A retry, not a gap. */
  | "failed";

export interface BrandResearchResult {
  brandKey: string;
  brandName: string;
  /** What the search actually runs on, where classification could name the company behind a store's
   *  abbreviation. Shown so a merchant can see *why* a search came back empty. */
  searchName: string;
  status: BrandResearchStatus;
  skuCount: number;
  /** The sizing parents this store carries the brand in, and how many of them have a chart. */
  sizingCategories: string[];
  chartedCategories: number;
  /** Charts stored for this brand, across every parent and variant. */
  chartCount: number;
  /** Whatever the last pass recorded, verbatim — the only place a merchant learns that a guide was
   *  found but covered the wrong categories. */
  note: string | null;
}

function lookupKey(brandKey: string, sizingCategory: string): string {
  return `${brandKey}|${sizingCategory}`;
}

/**
 * Indexes charts by (brand, category), preferring a store's own row over the shared one.
 *
 * One-to-**many**: a brand publishes a men's table and a women's one, and often several fit lines
 * per audience, so a single coverage pair legitimately stands behind a handful of charts. The
 * screen shows all of them; picking the one a given product resolves against is a later decision
 * that needs the product, which this join does not have.
 *
 * Within a key, charts are deduplicated on the variant name with a store's own row winning: the same
 * precedence the resolver uses. A merchant who hand-corrected a chart must see their own numbers
 * here, or the review screen would show them the shared chart they deliberately overrode. Keyed on
 * the variant since doc Part 5, matching `sizing_charts`' own index — on the old `(audience, source
 * title)` a merchant's forked copy sat *beside* the researched row instead of replacing it.
 *
 * Fit-class tables (`Men Big & Tall`, `Women Petite`, ...) are dropped here rather than shown and
 * left unauto-matched: this pipeline's one source of truth for which chart governs a SKU is the
 * taxonomy path — department → category → leaf — and a fit-class table has no leaf of its own to be
 * reached by, on any brand, seed or research-generated. Filtered at the one place both Stage 4's
 * display and Stage 5's dropdown read charts from, so neither screen can ever offer one.
 */
function indexCharts(charts: SizingChartRow[]): Map<string, SizingChartRow[]> {
  const byKey = new Map<string, Map<string, SizingChartRow>>();

  for (const chart of charts) {
    if (variantTags(chart.variantName).fit.length > 0) continue;
    const key = lookupKey(chart.brandKey, chart.sizingCategory);
    let variants = byKey.get(key);
    if (!variants) {
      variants = new Map();
      byKey.set(key, variants);
    }

    const existing = variants.get(chart.variantName);
    if (!existing || (existing.connectionId === null && chart.connectionId !== null)) {
      variants.set(chart.variantName, chart);
    }
  }

  return new Map(
    [...byKey].map(([key, variants]) => [
      key,
      [...variants.values()].sort((a, b) => a.variantName.localeCompare(b.variantName)),
    ])
  );
}

/**
 * One phrase explaining why a row has no chart, resolved from both the brand's routing and what
 * research actually concluded — the two carry different halves of the answer.
 *
 * Never called for a global row still sitting at `pending` — `buildChartResults` keeps those out of
 * `notFound` entirely, so every global row that reaches here was actually searched. That is what
 * lets the `pending` arm below just mean "not researched": the ambiguous case (a pass ran somewhere
 * in this store but this exact row's outcome never got recorded) doesn't reach it either.
 */
function gapReason(row: SizingCoverageRow): string {
  if (row.brandKey === UNKNOWN_BRAND_KEY || row.brandType === "none") {
    return "No brand on these products — needs a chart per category";
  }
  if (row.brandType === "private") {
    // A brand research demoted, rather than one the classifier called a house label from the start.
    // Both hand-fill, but a merchant reading "private label" against a name they know to be a real
    // brand would reasonably think the classification was wrong, when in fact it was corrected.
    return row.researchStatus === "not_found"
      ? "Searched and no public guide exists — hand-fill this one"
      : "Private label — no public chart exists to find";
  }
  if (row.brandType === "unclassified") {
    return "Brand not classified yet — not routed to research";
  }

  switch (row.researchStatus) {
    case "not_found":
      return "No official size guide found for this brand";
    case "not_covered":
      return "Guide found, but it does not cover this category";
    case "failed":
      return "Research failed — can be retried";
    case "found":
      // Recorded as found with no chart to show for it: a write that failed after the status was
      // set, or a chart deleted since. Surfaced rather than smoothed over, since it means the two
      // tables disagree.
      return "Recorded as found, but no chart is stored";
    case "pending":
    default:
      return "Not researched yet";
  }
}

function toGap(row: SizingCoverageRow): ChartGapResult {
  const unbranded = row.brandKey === UNKNOWN_BRAND_KEY;
  return {
    id: row.id,
    brandKey: row.brandKey,
    brandName: unbranded ? "No brand" : (row.brandName ?? row.brandKey),
    brandType: row.brandType,
    sizingCategory: row.sizingCategory,
    skuCount: row.skuCount,
    storeCategoryPaths: row.storeCategoryPaths,
    researchStatus: row.researchStatus,
    researchNote: row.researchNote,
    reason: gapReason(row),
    sampleSkus: row.sampleSkus.map((sample) => ({
      sku: sample.sku,
      title: sample.title,
      imageUrl: sample.imageUrl ?? null,
    })),
  };
}

export function buildChartResults(coverage: SizingCoverageRow[], charts: SizingChartRow[]): ChartResults {
  const byKey = indexCharts(charts);

  // A stored chart is itself proof a pass ran, so it counts alongside a recorded status. Without
  // that, a store whose charts predate the reason columns reads as "never researched" while showing
  // the charts research produced.
  const researched = charts.length > 0 || coverage.some((row) => row.researchStatus !== "pending");

  const results: ResearchedChartResult[] = [];
  const notFound: ChartGapResult[] = [];
  const noBrand: ChartGapResult[] = [];
  const chartedBrands = new Set<string>();
  let chartedPairs = 0;
  let chartedSkus = 0;
  let gapSkus = 0;
  // Global pairs still sitting at `pending` — queued, not failed. Counted toward `pairsNeeded` so
  // the store's total stays complete, but never pushed into `notFound`: that list is this store's
  // "could not chart" backlog, and a brand nobody has pressed Generate on yet has not failed to
  // chart, it just hasn't had its turn. It is already visible and actionable on the Global brands
  // tab, so leaving it out here too is what keeps that tab's count from drowning in brands still
  // waiting in the ordinary queue.
  let pendingGlobalPairs = 0;

  for (const row of coverage) {
    // A key this build no longer recognises means the group vocabulary changed under stored rows. It
    // cannot be rendered (there is no measurement set to build columns from) and it is not a gap a
    // merchant can fill either, so it is left out rather than shown as a fillable row.
    if (!isSizingCategory(row.sizingCategory)) continue;
    const group = row.sizingCategory;

    const charts = byKey.get(lookupKey(row.brandKey, row.sizingCategory)) ?? [];

    if (charts.length === 0) {
      gapSkus += row.skuCount;
      if (row.brandKey === UNKNOWN_BRAND_KEY || row.brandType === "none") {
        noBrand.push(toGap(row));
      } else if (row.brandType === "global" && row.researchStatus === "pending") {
        pendingGlobalPairs += 1;
      } else {
        notFound.push(toGap(row));
      }
      continue;
    }

    chartedBrands.add(row.brandKey);
    chartedPairs += 1;
    chartedSkus += row.skuCount;

    for (const chart of charts) {
      const { headers, rows } = chartTable(chart.chartRows, group);
      const quality = assessChart({ rows: chart.chartRows, group, sourceUrl: chart.sourceUrl });
      const confidence = Math.round((chart.confidence ?? 0) * 100);

      results.push({
        id: chart.id,
        brand: row.brandName ?? row.brandKey,
        brandKey: row.brandKey,
        sizingCategory: row.sizingCategory,
        variantName: chart.variantName,
        audience: chart.audience,
        sourceTitle: chart.sourceTitle,
        skuCount: row.skuCount,
        labelSystems: formatLabelSystems(chart.chartRows),
        // Stored 0-1, displayed 0-100. Rounded rather than truncated so 0.949 doesn't read as 94.
        confidence,
        lastUpdated: chart.updatedAt.slice(0, 10),
        sourceUrl: chart.sourceUrl,
        provenance: chart.provenance,
        shared: chart.connectionId === null,
        headers,
        rows,
        chartRows: chart.chartRows,
        coversLeaves: chart.coversLeaves,
        quality,
        needsReview: confidence < CHART_CONFIDENCE_PERCENT || hasBlockingQualityIssue(quality),
      });
    }
  }

  const bySkuDesc = <T extends { skuCount: number }>(a: T, b: T) => b.skuCount - a.skuCount;
  // Charts sort by the pair's size first so the brands that matter lead, then by category and
  // variant so one brand+parent's several variants stay adjacent — that grouping is what doc Part 5
  // asks the screen to show, and interleaving them with another parent's would hide it.
  results.sort(
    (a, b) =>
      b.skuCount - a.skuCount ||
      a.brandKey.localeCompare(b.brandKey) ||
      a.sizingCategory.localeCompare(b.sizingCategory) ||
      a.variantName.localeCompare(b.variantName)
  );
  notFound.sort(bySkuDesc);
  noBrand.sort(bySkuDesc);

  return {
    charts: results,
    notFound,
    noBrand,
    totals: {
      chartsFound: results.length,
      brandsCharted: chartedBrands.size,
      chartedSkus,
      // Pairs, not charts: this counts what the store needs covered, and one pair can be covered by
      // several published tables. Adding `results.length` here would make the denominator grow every
      // time research found *more*, which reads as the coverage getting worse. Includes
      // `pendingGlobalPairs` even though those don't appear in `notFound` — they still need a chart,
      // they are just tracked on the Global brands tab instead of this one.
      pairsNeeded: chartedPairs + notFound.length + noBrand.length + pendingGlobalPairs,
      gapSkus,
    },
    researched,
  };
}

/**
 * One row per global brand, at the grain the Generate button actually works on.
 *
 * Private and unbranded rows are deliberately absent. A web search cannot help either — a house label
 * publishes no public guide, and an empty brand field names nothing to search for — so putting them
 * here would offer an action that can only ever waste a paid request. They keep their manual-fill
 * tabs, which is where doc Tab 3 routes them.
 */
export function buildBrandResearch(
  coverage: SizingCoverageRow[],
  charts: SizingChartRow[],
  live: { scopedBrandKeys?: readonly string[]; currentBrandKey?: string | null } = {}
): BrandResearchResult[] {
  const scoped = new Set(live.scopedBrandKeys ?? []);
  const byKey = indexCharts(charts);

  const chartsPerBrand = new Map<string, number>();
  for (const chart of charts) {
    chartsPerBrand.set(chart.brandKey, (chartsPerBrand.get(chart.brandKey) ?? 0) + 1);
  }

  const brands = new Map<string, BrandResearchResult & { statuses: ResearchStatus[] }>();

  for (const row of coverage) {
    if (row.brandType !== "global" || row.brandKey === UNKNOWN_BRAND_KEY) continue;
    if (!isSizingCategory(row.sizingCategory)) continue;

    let brand = brands.get(row.brandKey);
    if (!brand) {
      brand = {
        brandKey: row.brandKey,
        brandName: row.brandName ?? row.brandKey,
        searchName: row.brandCanonicalName ?? row.brandName ?? row.brandKey,
        status: "pending",
        skuCount: 0,
        sizingCategories: [],
        chartedCategories: 0,
        chartCount: chartsPerBrand.get(row.brandKey) ?? 0,
        note: null,
        statuses: [],
      };
      brands.set(row.brandKey, brand);
    }

    brand.skuCount += row.skuCount;
    if (!brand.sizingCategories.includes(row.sizingCategory)) brand.sizingCategories.push(row.sizingCategory);
    if ((byKey.get(lookupKey(row.brandKey, row.sizingCategory)) ?? []).length > 0) brand.chartedCategories += 1;
    brand.statuses.push(row.researchStatus);
    // First note wins, and coverage arrives biggest-pair-first, so the note a merchant sees belongs to
    // the parent most of their stock is in rather than whichever row happened to be written last.
    brand.note ??= row.researchNote;
  }

  return [...brands.values()]
    .map(({ statuses, ...brand }) => ({
      ...brand,
      sizingCategories: [...brand.sizingCategories].sort(),
      status: brandStatus(brand, statuses, {
        researching: live.currentBrandKey === brand.brandKey,
        queued: scoped.has(brand.brandKey),
      }),
    }))
    .sort((a, b) => b.skuCount - a.skuCount || a.brandName.localeCompare(b.brandName));
}

function brandStatus(
  brand: { sizingCategories: string[]; chartedCategories: number },
  statuses: readonly ResearchStatus[],
  live: { researching: boolean; queued: boolean }
): BrandResearchStatus {
  // Live state outranks stored outcomes: a brand being regenerated still holds last pass's charts, and
  // showing it as Done while a search is running would make the button look like it did nothing.
  if (live.researching) return "researching";
  if (live.queued) return "queued";

  if (brand.chartedCategories >= brand.sizingCategories.length && brand.sizingCategories.length > 0) {
    return "done";
  }
  if (brand.chartedCategories > 0) return "partial";
  if (statuses.includes("failed")) return "failed";
  // Every parent still `pending` means nothing has looked yet. Anything else — `not_found`,
  // `not_covered` — means a pass ran and came back with nothing this store can use.
  if (statuses.every((status) => status === "pending")) return "pending";
  return "not_found";
}
