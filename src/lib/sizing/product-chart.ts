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
import { chartKey, splitRawSizeValue } from "./keys";
import type { SizeSettings } from "./size-types";
import { sizeTypeFor } from "./size-types";
import type { SizeChartRow } from "./chart-schema";
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
] as const;

export type ProductChartStatus = (typeof PRODUCT_CHART_STATUSES)[number];

export interface SizingResolutionContext {
  brandTypes: Map<string, BrandType>;
  brandMapping: StoreBrandMapping;
  brandMappingCurrent: boolean;
  sizeSettings: SizeSettings;
  sharedCharts: SizingChartRow[];
  privateCharts: SizingChartRow[];
}

interface ResolutionBase {
  status: ProductChartStatus;
  leafKey: string | null;
  canonicalBrandKey: string;
  unmatchedLabels: string[];
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
  rawSizeFormat: string | null;
}

function unresolved(
  status: Exclude<ProductChartStatus, "matched">,
  leafKey: string | null,
  canonicalBrandKey: string,
  unmatchedLabels: string[] = [],
): ProductChartResolution {
  return { status, leafKey, canonicalBrandKey, unmatchedLabels };
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

  if (!leafKey || leafKey.split(":").length !== 3 || !leafKey.split(":")[2]) {
    return unresolved("no-leaf", leafKey, canonicalBrandKey);
  }
  if (brandType === "unclassified") return unresolved("unclassified", leafKey, canonicalBrandKey);
  if (brandType === "global" && !context.brandMappingCurrent) {
    return unresolved("stale-brand-mapping", leafKey, canonicalBrandKey);
  }

  const [, categoryId] = leafKey.split(":");
  const leafGroup = personaSizingGroup(categoryId);
  if (!leafGroup || leafGroup !== input.sizingCategory) {
    return unresolved("parent-mismatch", leafKey, canonicalBrandKey);
  }

  const pathAudience = audienceForPersonaPath(leafKey);
  const source = brandType === "global" ? context.sharedCharts : context.privateCharts;
  const candidates = source.filter(
    (chart) =>
      chart.brandKey === canonicalBrandKey &&
      chart.sizingCategory === leafGroup &&
      (!pathAudience || audienceCompatible(pathAudience, chart.audience)),
  );
  const claimants = candidates.filter((chart) => chart.coversLeaves.includes(leafKey));
  const plain = claimants.filter((chart) => variantTags(chart.variantName).fit.length === 0);

  if (plain.length > 1) return unresolved("ambiguous", leafKey, canonicalBrandKey);
  if (plain.length === 0) {
    return unresolved(claimants.length > 0 ? "fit-only" : "no-chart", leafKey, canonicalBrandKey);
  }
  if (input.rawSizeFormat === null) return unresolved("sizes-unknown", leafKey, canonicalBrandKey);

  const chart = plain[0];
  // Size-system overrides are chosen in Stage 1, before canonical brand mapping exists, so they
  // remain keyed by the raw store brand even when the shared chart is keyed canonically.
  const sizeType = sizeTypeFor(input.brandKey, context.sizeSettings);
  const matched = matchRawFormat(input.rawSizeFormat, chart.chartRows, sizeType);
  if (!matched.fullyMatched) {
    return unresolved(
      "sizes-unresolved",
      leafKey,
      canonicalBrandKey,
      matched.matches.filter((match) => match.row === null).map((match) => match.raw),
    );
  }

  return {
    status: "matched",
    leafKey,
    canonicalBrandKey,
    chart,
    chartKey: chartKey(canonicalBrandKey, leafGroup, chart.variantName, sizeType, chart.version),
    canonicalSizes: matched.matches.map((match) => canonicalLabelForRow(match.row!, sizeType)),
    sizeMatches: matched.matches.map((match) => ({
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
  };
}

export function stockSizeLabels(input: ProductChartInput): string[] {
  return input.rawSizeFormat ? splitRawSizeValue(input.rawSizeFormat) : [];
}
