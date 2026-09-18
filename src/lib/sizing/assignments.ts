import type { SizingChartRow } from "@/lib/db/sizing-charts";
import type { BrandType, SizingCoverageRow } from "@/lib/db/sizing-coverage";
import type { SizingPathCoverageRow } from "@/lib/db/sizing-path-coverage";
import type {
  AssignmentSource,
  SizingChartAssignmentRow,
} from "@/lib/db/sizing-chart-assignments";
import { chartTable, CHART_CONFIDENCE_PERCENT } from "./chart-review";
import { audienceFor, isSizingCategory, UNKNOWN_BRAND_KEY, type Audience } from "./keys";
import { pathKey } from "./path-coverage";
import type { SizingGroup } from "./measurements";

/**
 * Doc Part 7 — joining what the store carries per merchant category path against the chart variants
 * research discovered, into Stage 5's assignment table.
 *
 * The stage exists because a brand publishes several charts and a store files that brand under
 * several paths, and only the merchant knows which goes with which. Research can prove that Tommy
 * Hilfiger publishes a men's tops table and a women's one; it cannot know that this store's
 * `Sale > Tops` is womenswear. So the pipeline offers, and the merchant decides.
 *
 * Pure, like `chart-results.ts`, and for the same reason: the whole join is the interesting part and
 * it should be testable without a database.
 */

/** One chart the merchant may bind a path to. */
export interface AssignableVariant {
  chartId: string;
  variantName: string;
  audience: Audience;
  /** The gender stated inside the variant name, where the brand states one. The stronger signal of
   *  the two for matching, since `audience` is read off the page the table sat on. */
  variantGender: Audience | null;
  variantFitType: string | null;
  /** 0-100, matching the rest of the sizing UI. */
  confidence: number;
  sourceTitle: string;
  sourceUrl: string | null;
  shared: boolean;
  needsReview: boolean;
  headers: string[];
  rows: Record<string, string>[];
}

export interface PathAssignmentResult {
  /** Stable across reads, derived from the natural key — there is no id to hand out for a path nobody
   *  has assigned yet, and the UI needs to address one. */
  id: string;
  brandKey: string;
  brandName: string;
  brandType: BrandType;
  categoryId: string;
  /** Breadcrumb, root first. What the merchant recognises the path by. */
  categoryPath: string[];
  sizingCategory: SizingGroup;
  skuCount: number;
  /** The bound variant's name, or null. Null with `decided` true is the merchant's explicit "no chart
   *  here"; null with `decided` false is a path nobody has answered. */
  variantName: string | null;
  decided: boolean;
  source: AssignmentSource | null;
  /** Every variant this brand published for this parent, and so everything the dropdown may offer. */
  variants: AssignableVariant[];
  /** True when the stored variant name matches nothing currently in `sizing_charts` — a re-run of
   *  research that renamed or dropped the table the merchant had chosen. Surfaced rather than silently
   *  cleared, because the merchant's decision is still the best evidence of their intent. */
  missingVariant: boolean;
}

function variantKey(brandKey: string, sizingCategory: string): string {
  return `${brandKey}|${sizingCategory}`;
}

/**
 * Chart variants per (brand, parent), preferring this store's own row over the shared one.
 *
 * The same precedence and the same dedupe-on-variant-name as `chart-results.ts` uses, because a
 * merchant who forked and corrected a chart must be offered their numbers here — offering them the
 * shared row they deliberately overrode would make the fork pointless.
 */
export function indexAssignableVariants(charts: SizingChartRow[]): Map<string, AssignableVariant[]> {
  const byKey = new Map<string, Map<string, SizingChartRow>>();

  for (const chart of charts) {
    if (!isSizingCategory(chart.sizingCategory)) continue;
    const key = variantKey(chart.brandKey, chart.sizingCategory);
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
      [...variants.values()]
        .map((chart) => toAssignable(chart))
        .sort((a, b) => a.variantName.localeCompare(b.variantName)),
    ])
  );
}

function toAssignable(chart: SizingChartRow): AssignableVariant {
  const group = chart.sizingCategory as SizingGroup;
  const { headers, rows } = chartTable(chart.chartRows, group);
  const confidence = Math.round((chart.confidence ?? 0) * 100);

  return {
    chartId: chart.id,
    variantName: chart.variantName,
    audience: chart.audience,
    variantGender: chart.variantGender,
    variantFitType: chart.variantFitType,
    confidence,
    sourceTitle: chart.sourceTitle,
    sourceUrl: chart.sourceUrl,
    shared: chart.connectionId === null,
    needsReview: confidence < CHART_CONFIDENCE_PERCENT,
    headers,
    rows,
  };
}

/**
 * Every merchant path this store carries, with what it is bound to and what it could be.
 *
 * Path coverage drives it, not assignments — the screen has to account for every path the catalog
 * produced, and listing stored assignments alone would show the six decisions already made while
 * quietly omitting the forty paths still governing stock with no chart.
 */
export function buildPathAssignments(input: {
  pathCoverage: SizingPathCoverageRow[];
  coverage: SizingCoverageRow[];
  charts: SizingChartRow[];
  assignments: SizingChartAssignmentRow[];
}): PathAssignmentResult[] {
  const variantsByKey = indexAssignableVariants(input.charts);
  const brandTypes = new Map(input.coverage.map((row) => [row.brandKey, row.brandType]));
  const stored = new Map(
    input.assignments.map((row) => [pathKey(row.brandKey, row.categoryId, row.sizingCategory), row])
  );

  const results: PathAssignmentResult[] = [];

  for (const row of input.pathCoverage) {
    // A key this build no longer recognises means the parent vocabulary changed under stored rows.
    // There is no measurement set to render a chart against, so it cannot be assigned either.
    if (!isSizingCategory(row.sizingCategory)) continue;

    const key = pathKey(row.brandKey, row.categoryId, row.sizingCategory);
    const assignment = stored.get(key) ?? null;
    const variants = variantsByKey.get(variantKey(row.brandKey, row.sizingCategory)) ?? [];
    const variantName = assignment?.variantName ?? null;

    results.push({
      id: key,
      brandKey: row.brandKey,
      brandName: row.brandKey === UNKNOWN_BRAND_KEY ? "No brand" : (row.brandName ?? row.brandKey),
      brandType: brandTypes.get(row.brandKey) ?? "unclassified",
      categoryId: row.categoryId,
      categoryPath: row.categoryPath,
      sizingCategory: row.sizingCategory,
      skuCount: row.skuCount,
      variantName,
      decided: assignment !== null,
      source: assignment?.source ?? null,
      variants,
      missingVariant:
        variantName !== null && !variants.some((variant) => variant.variantName === variantName),
    });
  }

  return results.sort(
    (a, b) =>
      b.skuCount - a.skuCount ||
      a.brandName.localeCompare(b.brandName) ||
      a.categoryPath.join(" / ").localeCompare(b.categoryPath.join(" / "))
  );
}

/**
 * The assignments safe to make without asking.
 *
 * Two cases only, and the restraint is the point. A brand publishing exactly one chart for a parent
 * has no decision in it. A path whose audience is unmistakable from its own breadcrumb — `Men >
 * Jackets` — and which matches exactly one variant likewise has one right answer.
 *
 * Everything else is left unassigned rather than given the first or the most confident variant.
 * Guessing between a brand's Regular and its Petite line puts every shopper on that path against the
 * wrong body measurements and reports the path as governed, which is worse than reporting it as
 * unassigned and having the merchant spend ten seconds on it.
 *
 * Never touches a path that already has a row, including a merchant's explicit "no chart". A later
 * research pass discovering a second variant must not overwrite a choice already made.
 */
export function autoMatchAssignments(
  paths: readonly PathAssignmentResult[]
): { path: PathAssignmentResult; variantName: string }[] {
  const matched: { path: PathAssignmentResult; variantName: string }[] = [];

  for (const path of paths) {
    if (path.decided || path.variants.length === 0) continue;

    if (path.variants.length === 1) {
      matched.push({ path, variantName: path.variants[0].variantName });
      continue;
    }

    const audience = audienceFor({ hints: path.categoryPath });
    // `unisex` is `audienceFor`'s "nothing resolved" answer as well as a real one, so it cannot be
    // used to pick between variants — matching on it would assign every unlabelled path to whichever
    // table the brand happened to publish as unisex.
    if (audience === "unisex") continue;

    const candidates = path.variants.filter(
      (variant) => (variant.variantGender ?? variant.audience) === audience
    );
    if (candidates.length === 1) matched.push({ path, variantName: candidates[0].variantName });
  }

  return matched;
}

export interface AssignmentTotals {
  paths: number;
  assigned: number;
  /** Paths with a chart, weighted by the stock they govern — the number that says whether the
   *  remaining work matters. */
  assignedSkus: number;
  /** Paths nobody has answered. An explicit "no chart" is a decision and is not counted here. */
  unresolved: number;
  unresolvedSkus: number;
  /** Explicit no-chart decisions, counted separately so the screen can say the merchant chose this. */
  skipped: number;
}

export function assignmentTotals(paths: readonly PathAssignmentResult[]): AssignmentTotals {
  const totals: AssignmentTotals = {
    paths: paths.length,
    assigned: 0,
    assignedSkus: 0,
    unresolved: 0,
    unresolvedSkus: 0,
    skipped: 0,
  };

  for (const path of paths) {
    if (path.variantName !== null && !path.missingVariant) {
      totals.assigned += 1;
      totals.assignedSkus += path.skuCount;
    } else if (path.decided && path.variantName === null) {
      totals.skipped += 1;
    } else {
      totals.unresolved += 1;
      totals.unresolvedSkus += path.skuCount;
    }
  }

  return totals;
}
