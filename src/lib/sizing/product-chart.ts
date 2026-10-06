import type { StoreConnectionRow } from "@/lib/db/store-connections";
import type { BrandType } from "@/lib/db/sizing-coverage";
import type { SizingChartRow } from "@/lib/db/sizing-charts";
import { personaSizingGroup } from "@/modules/store/mapping/persona-taxonomy";
import { canonicalLabelForRow, matchRawFormat } from "./canonical";
import {
  brandMappingIsCurrent,
  resolveMappedBrandKey,
  type StoreBrandMapping,
} from "./brand-mapping";
import { chartKey, normalizeSizeLabel, splitRawSizeValue } from "./keys";
import { UNSUPPORTED_SOURCES } from "./seeds/unsupported-sources";
import type { SizeSettings } from "./size-types";
import { sizeTypeFor, type SizeType } from "./size-types";
import type { ChartApplicability, SizeChartRow } from "./chart-schema";
import { isSizingGroup } from "./measurements";
import {
  audienceCompatible,
  audienceForPersonaPath,
  variantTags,
} from "./variant-match";

export const PRODUCT_CHART_STATUSES = [
  "matched",
  "sizes-unknown",
  "no-leaf",
  "unclassified",
  "stale-brand-mapping",
  "no-chart",
  "ambiguous",
  "fit-only",
  "parent-mismatch",
  "sizes-unresolved",
  "unsupported-source",
] as const;

export type ProductChartStatus = (typeof PRODUCT_CHART_STATUSES)[number];

export interface SizingResolutionContext {
  brandTypes: Map<string, BrandType>;
  brandMapping: StoreBrandMapping;
  brandMappingCurrent: boolean;
  sizeSettings: SizeSettings;
  sharedCharts: SizingChartRow[];
  privateCharts: SizingChartRow[];
  unsupportedSources?: UnsupportedSourceState[];
}

export interface UnsupportedSourceState {
  brandKey: string;
  leafKey: string;
  /**
   * Set when the brand's official source covers the leaf but publishes no row for these specific
   * stocked labels (for example hosiery sizes 1-6). Absent means the whole leaf has no source.
   */
  labels?: string[];
  reason: string;
  missingFields: string[];
  verifiedAt: string;
  evidenceUrl?: string;
}

interface ResolutionBase {
  status: ProductChartStatus;
  leafKey: string | null;
  canonicalBrandKey: string;
  unmatchedLabels: string[];
  unsupportedSource?: UnsupportedSourceState;
}

export interface MatchedProductChart extends ResolutionBase {
  status: "matched";
  leafKey: string;
  chart: SizingChartRow;
  chartKey: string;
  canonicalSizes: string[];
  sizeMatches: Array<{ raw: string; canonical: string; row: SizeChartRow }>;
  needsReview: boolean;
}

export type ProductChartResolution =
  | MatchedProductChart
  | (ResolutionBase & { status: Exclude<ProductChartStatus, "matched"> });

export interface ProductChartInput {
  brandKey: string;
  sizingCategory: string;
  primaryPersonaLeafKey: string | null;
  /** Every size the product lists, in stock or not. The chart is chosen and checked against this, so
   *  a sold-out product still resolves to the chart it will have the moment it is restocked. */
  rawSizeFormat: string | null;
  /** The sizes buyable right now. When present, only these reach the published sizing rows; absent
   *  means every size in `rawSizeFormat` is published. */
  purchasableSizeFormat?: string | null;
  /** Validated bridge for a merchant custom leaf. Global charts never claim arbitrary custom keys. */
  standardPersonaLeafKey?: string | null;
  productLine?: string | null;
  /** Boys/girls evidence for a kids-unisex path, from the product's own gender or title. */
  audienceHint?: "boys" | "girls" | null;
  fitClass?: string | null;
  ageMonths?: number | null;
  market?: string | null;
  sizeType?: SizeType | null;
}

function comparableLabel(label: string): string {
  return normalizeSizeLabel(label.replace(/\\+/g, "/"));
}

function unsupportedLabelSet(state: UnsupportedSourceState): Set<string> {
  return new Set((state.labels ?? []).map(comparableLabel));
}

function normalizedEqual(left: string | null | undefined, right: string | null | undefined): boolean {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());
}

function applicabilityMatches(
  applicability: ChartApplicability,
  input: ProductChartInput,
): boolean {
  if (input.productLine && applicability.productLine &&
      !normalizedEqual(input.productLine, applicability.productLine)) return false;
  if (input.fitClass && applicability.fitClass &&
      !normalizedEqual(input.fitClass, applicability.fitClass)) return false;
  if (input.market && applicability.market &&
      !normalizedEqual(input.market, applicability.market)) return false;
  if (input.ageMonths !== null && input.ageMonths !== undefined && applicability.ageBand) {
    const { minMonths, maxMonths } = applicability.ageBand;
    if (minMonths !== undefined && input.ageMonths < minMonths) return false;
    if (maxMonths !== undefined && input.ageMonths > maxMonths) return false;
  }
  return true;
}

/**
 * Several charts fully fit the stocked labels. Deterministic, evidence-ordered tie-breaks:
 *   1. the product states a line/audience and exactly one chart is that line/audience;
 *   2. otherwise the chart that needs no unstated qualifier (a plain table beats a product-line
 *      table such as "Denim Female" when the product never said it belongs to that line).
 * Anything still tied stays `ambiguous`, never a guess.
 */
function narrowByPriority<T extends { chart: SizingChartRow }>(
  candidates: T[],
  input: ProductChartInput,
): T[] {
  const lineMatches = input.productLine
    ? candidates.filter(({ chart }) => normalizedEqual(chart.applicability?.productLine, input.productLine))
    : [];
  if (lineMatches.length > 0) candidates = lineMatches;

  if (input.audienceHint) {
    const hinted = candidates.filter(({ chart }) => chart.audience === input.audienceHint);
    if (hinted.length > 0) candidates = hinted;
  }

  const unqualified = candidates.filter(({ chart }) => !chart.applicability?.productLine);
  if (!input.productLine && unqualified.length > 0) candidates = unqualified;
  return candidates;
}

/**
 * Label matching per chart, remembered for the life of the loaded chart rows. A catalog repeats the
 * same few size runs ("S,M,L,XL") across thousands of products, and matching is the expensive step
 * of resolving one, so re-resolving a whole store after a chart edit does each distinct run once.
 * Keyed on the chart object itself: a fresh context load brings fresh rows and an empty memo.
 */
const chartMatchMemo = new WeakMap<SizingChartRow, Map<string, ReturnType<typeof matchRawFormat>>>();

function matchChartRows(
  rawSizeFormat: string,
  chart: SizingChartRow,
  sizeType: SizeType,
): ReturnType<typeof matchRawFormat> {
  let byFormat = chartMatchMemo.get(chart);
  if (!byFormat) {
    byFormat = new Map();
    chartMatchMemo.set(chart, byFormat);
  }
  const key = `${sizeType}\u0000${rawSizeFormat}`;
  let matched = byFormat.get(key);
  if (!matched) {
    matched = matchRawFormat(rawSizeFormat, chart.chartRows, sizeType);
    byFormat.set(key, matched);
  }
  return matched;
}

function unresolved(
  status: Exclude<ProductChartStatus, "matched">,
  leafKey: string | null,
  canonicalBrandKey: string,
  unmatchedLabels: string[] = [],
  unsupportedSource?: UnsupportedSourceState,
): ProductChartResolution {
  return { status, leafKey, canonicalBrandKey, unmatchedLabels, unsupportedSource };
}

/**
 * Resolves exactly one chart from the product's primary Persona leaf.
 *
 * No assignment record or SKU override is consulted: `covers_leaves` is the sole chart-routing
 * truth. Zero and several claimants are both explicit unresolved outcomes.
 */
export function resolveProductChart(
  input: ProductChartInput,
  context: SizingResolutionContext,
): ProductChartResolution {
  const leafKey = input.primaryPersonaLeafKey;
  const brandType = context.brandTypes.get(input.brandKey) ?? "unclassified";
  const mapped = resolveMappedBrandKey(input.brandKey, null, context.brandMapping);
  const canonicalBrandKey = brandType === "global" ? mapped.brandKey : input.brandKey;

  if (!leafKey) {
    return unresolved("no-leaf", leafKey, canonicalBrandKey);
  }
  if (brandType === "unclassified") return unresolved("unclassified", leafKey, canonicalBrandKey);
  if (brandType === "global" && !context.brandMappingCurrent) {
    return unresolved("stale-brand-mapping", leafKey, canonicalBrandKey);
  }

  const bridgedLeaf = input.standardPersonaLeafKey ?? null;
  const routingLeaf = bridgedLeaf || leafKey;
  const parts = routingLeaf.split(":");
  const isStandardLeaf = parts.length === 3 && Boolean(parts[2]);
  if (brandType === "global" && !isStandardLeaf) {
    return unresolved("no-leaf", leafKey, canonicalBrandKey);
  }
  const categoryId = parts[1] ?? "";
  const leafGroup = isStandardLeaf
    ? personaSizingGroup(categoryId)
    : isSizingGroup(input.sizingCategory) ? input.sizingCategory : null;
  if (!leafGroup || leafGroup !== input.sizingCategory) {
    return unresolved("parent-mismatch", leafKey, canonicalBrandKey);
  }

  const pathAudience = isStandardLeaf ? audienceForPersonaPath(routingLeaf) : null;
  const source = brandType === "global" ? context.sharedCharts : context.privateCharts;
  const candidates = source.filter(
    (chart) =>
      chart.brandKey === canonicalBrandKey &&
      chart.sizingCategory === leafGroup &&
      (!pathAudience || audienceCompatible(pathAudience, chart.audience)) &&
      applicabilityMatches(chart.applicability ?? {}, input),
  );
  // A kids-unisex path is a merchant filing choice, not a body: when the product itself says
  // "Boys" or "Girls", the matching department's charts may size it as well.
  const hintedLeaf =
    parts[0] === "kids-unisex" && input.audienceHint
      ? `kids-${input.audienceHint}:${parts[1]}:${parts[2]}`
      : null;
  const claimants = candidates.filter(
    (chart) =>
      chart.coversLeaves.includes(routingLeaf) ||
      (hintedLeaf !== null && chart.coversLeaves.includes(hintedLeaf)),
  );
  const selectable = claimants.filter((chart) => {
    const fitClass = chart.applicability?.fitClass;
    if (fitClass) return normalizedEqual(input.fitClass, fitClass);
    return input.fitClass ? true : variantTags(chart.variantName).fit.length === 0;
  });

  if (selectable.length === 0) {
    const unsupported = context.unsupportedSources?.find(
      (state) =>
        state.brandKey === canonicalBrandKey &&
        state.leafKey === routingLeaf &&
        state.labels === undefined,
    );
    if (claimants.length === 0 && unsupported) {
      return unresolved("unsupported-source", leafKey, canonicalBrandKey, [], unsupported);
    }
    return unresolved(claimants.length > 0 ? "fit-only" : "no-chart", leafKey, canonicalBrandKey);
  }
  if (input.rawSizeFormat === null) return unresolved("sizes-unknown", leafKey, canonicalBrandKey);

  // Size-system overrides are chosen in Stage 1, before canonical brand mapping exists, so they
  // remain keyed by the raw store brand even when the shared chart is keyed canonically.
  const sizeType = input.sizeType ?? sizeTypeFor(input.brandKey, context.sizeSettings);
  const candidateMatches = selectable.map((chart) => ({
    chart,
    matched: matchChartRows(input.rawSizeFormat!, chart, sizeType),
  }));
  let fullyMatched = candidateMatches.filter(({ matched }) => matched.fullyMatched);
  if (fullyMatched.length > 1) fullyMatched = narrowByPriority(fullyMatched, input);
  if (fullyMatched.length > 1) return unresolved("ambiguous", leafKey, canonicalBrandKey);
  if (fullyMatched.length === 0) {
    // Report against the candidate chart that came closest, not the union of every candidate:
    // a label another chart resolves is not "unmatched" for the chart that would be chosen.
    const unmatchedPerChart = candidateMatches
      .map(({ matched }) => [...new Set(
        matched.matches.filter((match) => match.row === null).map((match) => match.raw),
      )])
      .sort((left, right) => left.length - right.length);
    const unmatched = unmatchedPerChart[0] ?? [];
    // Unsupported when, for some candidate chart, every label it cannot place is one the source is
    // known not to publish.
    for (const gaps of unmatchedPerChart) {
      const labelGap = context.unsupportedSources?.find(
        (state) =>
          state.brandKey === canonicalBrandKey &&
          state.leafKey === routingLeaf &&
          state.labels !== undefined &&
          gaps.length > 0 &&
          gaps.every((label) => unsupportedLabelSet(state).has(comparableLabel(label))),
      );
      if (labelGap) return unresolved("unsupported-source", leafKey, canonicalBrandKey, gaps, labelGap);
    }
    return unresolved("sizes-unresolved", leafKey, canonicalBrandKey, unmatched);
  }
  const { chart, matched } = fullyMatched[0];
  const purchasable = input.purchasableSizeFormat === undefined
    ? null
    : new Set(splitRawSizeValue(input.purchasableSizeFormat ?? "").map(comparableLabel));
  const publishedMatches = purchasable
    ? matched.matches.filter((match) => purchasable.has(comparableLabel(match.raw)))
    : matched.matches;

  return {
    status: "matched",
    leafKey,
    canonicalBrandKey,
    chart,
    chartKey: chartKey(canonicalBrandKey, leafGroup, chart.variantName, sizeType, chart.version),
    canonicalSizes: publishedMatches.map((match) => canonicalLabelForRow(match.row!, sizeType)),
    sizeMatches: publishedMatches.map((match) => ({
      raw: match.raw,
      canonical: canonicalLabelForRow(match.row!, sizeType),
      row: match.row!,
    })),
    needsReview: matched.needsReview,
    unmatchedLabels: [],
  };
}

export async function loadSizingResolutionContext(
  connection: Pick<StoreConnectionRow, "id" | "sizingBrandMapping" | "storeSizeSettings">,
): Promise<SizingResolutionContext> {
  const [
    { listSizingCoverage },
    { listPrivateChartsForBrands, listSharedChartsForBrands },
  ] = await Promise.all([
    import("@/lib/db/sizing-coverage"),
    import("@/lib/db/sizing-charts"),
  ]);
  const coverage = await listSizingCoverage(connection.id);
  const brandTypes = new Map<string, BrandType>();
  for (const row of coverage) brandTypes.set(row.brandKey, row.brandType);

  const globalKeys = [...brandTypes].filter(([, type]) => type === "global").map(([key]) => key);
  const privateKeys = [...brandTypes]
    .filter(([, type]) => type === "private" || type === "none")
    .map(([key]) => key);
  const brandMappingCurrent =
    globalKeys.length === 0 || brandMappingIsCurrent(globalKeys, connection.sizingBrandMapping);
  const canonicalGlobalKeys = brandMappingCurrent
    ? [...new Set(globalKeys.map((key) =>
        resolveMappedBrandKey(key, null, connection.sizingBrandMapping).brandKey))]
    : [];

  const [sharedCharts, privateCharts] = await Promise.all([
    listSharedChartsForBrands(canonicalGlobalKeys),
    listPrivateChartsForBrands(connection.id, privateKeys),
  ]);

  return {
    brandTypes,
    brandMapping: connection.sizingBrandMapping,
    brandMappingCurrent,
    sizeSettings: connection.storeSizeSettings,
    sharedCharts,
    privateCharts,
    unsupportedSources: UNSUPPORTED_SOURCES,
  };
}

export function stockSizeLabels(input: ProductChartInput): string[] {
  return input.rawSizeFormat ? splitRawSizeValue(input.rawSizeFormat) : [];
}
