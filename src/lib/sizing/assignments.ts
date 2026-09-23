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
import { audienceCompatible, audienceForPersonaPath, chartsForLeaf, variantTags } from "./variant-match";
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
  /** The Persona leaf keys this exact chart claims — `sizing_charts.covers_leaves`. What
   *  `autoMatchAssignments` matches a path's own leaf key against; see `chartsForLeaf`. */
  coversLeaves: string[];
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
  /** Everything the dropdown may offer: the variants this brand published for this parent that can
   *  legitimately size this path's audience. An adult path is never offered a child's table. */
  variants: AssignableVariant[];
  /** The audience this path is sized for, read off its Persona department. Null for rows keyed on a
   *  merchant category id from before Universal Mapping, which state no audience and so are not
   *  filtered. */
  audience: Audience | null;
  /** Variants this brand published for this parent that `audience` ruled out.
   *
   *  Carried so the screen can tell the two empty states apart. "Nothing researched for this brand"
   *  is fixed on Stage 4 by generating; "the brand has three bottoms tables and none of them are
   *  menswear" is a coverage gap, and saying the first when it is the second sends the merchant to
   *  re-run research that already succeeded. */
  variantsOtherAudience: number;
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
 *
 * Fit-class tables are excluded from the dropdown entirely, same as `chart-results.ts`'s
 * `indexCharts` — this pipeline's one source of truth for which chart governs a SKU is the taxonomy
 * path, and a fit-class table has no leaf to be reached by, so it is never a legitimate answer for a
 * merchant to pick either.
 */
export function indexAssignableVariants(charts: SizingChartRow[]): Map<string, AssignableVariant[]> {
  const byKey = new Map<string, Map<string, SizingChartRow>>();

  for (const chart of charts) {
    if (!isSizingCategory(chart.sizingCategory)) continue;
    if (variantTags(chart.variantName).fit.length > 0) continue;
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
    coversLeaves: chart.coversLeaves,
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
    const published = variantsByKey.get(variantKey(row.brandKey, row.sizingCategory)) ?? [];
    const variantName = assignment?.variantName ?? null;
    const audience = audienceForPersonaPath(row.categoryId);

    // A stored choice survives the filter even when the audience rules it out. The merchant made that
    // decision against the list we offered at the time, and hiding it would report their answer as
    // missing and invite them to make it again — while `missingVariant` below screamed that research
    // had dropped a table that is in fact still there.
    const variants =
      audience === null
        ? published
        : published.filter(
            (variant) => variant.variantName === variantName || audienceCompatible(audience, variant.audience)
          );

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
      audience,
      variantsOtherAudience: published.length - variants.length,
      // Checked against everything published, not the filtered list: the question is whether research
      // still holds the table the merchant chose, and the audience guard is not evidence about that.
      missingVariant:
        variantName !== null && !published.some((variant) => variant.variantName === variantName),
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
 * The audience constraint is already applied — `path.variants` only contains tables that may size
 * this path — so what is left is which of those tables this exact leaf belongs to, which
 * `chartsForLeaf` answers by reading the chart's own `covers_leaves` rather than guessing from its
 * name: `jean` takes the table that lists `women:bottom:jean`, `blazer` the one that lists
 * `men:outerwear:blazer`, and so on.
 *
 * `path.categoryId` is passed as-is — it already *is* the full leaf key (`women:bottom:jean`) that
 * `covers_leaves` entries are written in, not a leaf name to be re-derived. A category-level mapping
 * (`women:bottom:`, no leaf chosen) matches nothing and is correctly left unresolved: there is no
 * leaf for any chart to have claimed, and guessing a "base" table for it is exactly the tag-blind
 * behaviour this module replaced.
 *
 * What must stay unguessed regardless of leaf is a fit class: `Men Big & Tall` and
 * `Men Tailored Long` describe a shopper, not a path, so they are never auto-picked and the merchant
 * keeps that decision — enforced both by chart authors never listing a leaf on a fit-class table and,
 * belt and braces, by `chartsForLeaf` itself.
 *
 * Never touches a path that already has a row, including a merchant's explicit "no chart". A later
 * research pass discovering a second variant must not overwrite a choice already made.
 */
export function autoMatchAssignments(
  paths: readonly PathAssignmentResult[]
): { path: PathAssignmentResult; variantName: string }[] {
  const matched: { path: PathAssignmentResult; variantName: string }[] = [];

  for (const path of paths) {
    if (path.decided) continue;

    const pick = chartsForLeaf(path.categoryId, candidatesFor(path));
    if (pick) matched.push({ path, variantName: pick.variantName });
  }

  return matched;
}

/**
 * The variants auto-match may choose from.
 *
 * Normally just `path.variants` — `buildPathAssignments` already applied the audience guard using the
 * path's Persona department, which is a stated fact rather than a reading.
 *
 * The fallback covers `sizing_path_coverage` rows written before Universal Mapping, which key on the
 * merchant's own category id and so have no department to read. For those, and only those, the old
 * breadcrumb regex is still the best available signal. `unisex` is discarded there because `audienceFor`
 * returns it both for a genuinely unisex path and for one it could not read at all — the ambiguity that
 * `audienceForPersonaPath` exists to avoid, and the reason this is a fallback rather than the rule.
 */
function candidatesFor(path: PathAssignmentResult): AssignableVariant[] {
  if (path.audience !== null) return path.variants;

  const guessed = audienceFor({ hints: path.categoryPath });
  if (guessed === "unisex") return path.variants;

  return path.variants.filter((variant) => variant.audience === guessed);
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
