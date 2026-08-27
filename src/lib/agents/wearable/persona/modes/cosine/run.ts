import { acsSearchCatalogProducts, type AcsSearchParams } from "@/lib/catalog/acs/search-adapter";
import type { CatalogFilter, DiscussedBundleItem, RetrievalContext } from "@/lib/retrieval/types";
import { resolveBundleSwapTargets } from "../../anchor";
import { applyHardRules, buildFilter } from "../filter/build-filter";
import { MAX_RESULTS, relaxationNote, type CosineOptions, type ModeOutcome } from "../mode-outcome";
import { searchWithRelaxation } from "../../search";
import { buildQueryStatement } from "./build-statement";

/**
 * Filter first, then rank the filtered set by semantic fit — which is why this skill imports the
 * filter skill's builder rather than duplicating it. The filter and the query statement are
 * built concurrently, then the relaxation ladder runs against ACS.
 *
 * Two things differ from the pgvector implementation this replaced:
 *
 * 1. No `embedQueryStatement` call: ACS takes the statement as free-text `query` and does its own
 *    retrieval/ranking server-side, so there is no client-side vector to compute or compare.
 * 2. No fused image+text vector "already made the visual judgement at index time" — ACS's
 *    ranking is text/attribute-driven. Whether that costs real quality on visually-led queries
 *    ("something flowy", "a structured blazer") is an open question the cutover accepted rather
 *    than blocked on.
 */
/**
 * Per the architecture brief's Scenario B: a follow-up scoped to one item of a bundle the
 * shopper is discussing ("replace the pants", "different shirt and pants") resolves and
 * searches through cosine, never back through bundle mode. Each matched item gets its own
 * scoped search — category plus its own price as the ceiling, standing in for a real
 * allocation until Phase 5's Budget Allocator exists — and the results are concatenated so a
 * message naming two items returns candidates for both.
 */
async function runBundleSwapSearch(context: RetrievalContext, targets: DiscussedBundleItem[]): Promise<ModeOutcome> {
  const outcomes = await Promise.all(
    targets.map((target) =>
      runCosineMode(context, {
        targetCategory: target.category,
        filterOverride: {
          garmentCategory: target.category,
          priceMax: target.price,
          inStockOnly: true,
          excludeExternalIds: context.shownExternalIds,
        },
      })
    )
  );

  return {
    candidates: outcomes.flatMap((outcome) => outcome.candidates),
    note: outcomes.find((outcome) => outcome.note)?.note,
    attributionToken: outcomes.find((outcome) => outcome.attributionToken)?.attributionToken,
  };
}

export async function runCosineMode(context: RetrievalContext, options: CosineOptions = {}): Promise<ModeOutcome> {
  if (!options.filterOverride) {
    const swapTargets = resolveBundleSwapTargets(context.query, context.bundle?.discussed);
    if (swapTargets.length > 0) return runBundleSwapSearch(context, swapTargets);
  }

  const [built, statement] = await Promise.all([
    options.filterOverride
      ? Promise.resolve({ filter: options.filterOverride, corrections: [] })
      : buildFilter({
          query: context.query,
          recentTurns: context.recentTurns,
          facets: context.facets,
          apiKey: context.apiKey,
          anchorCategory: context.anchor?.category,
          budgetMax: context.budgetMax,
          budgetMin: context.budgetMin,
        }),
    buildQueryStatement({
      query: context.query,
      recentTurns: context.recentTurns,
      anchor: context.anchor,
      styleGuide: context.styleGuide,
      targetCategory: options.targetCategory,
      apiKey: context.apiKey,
    }),
  ]);

  const filter = applyHardRules(
    { ...built.filter, excludeExternalIds: context.shownExternalIds },
    context.hardRules
  );

  const attributionTokenOut: { current?: string } = {};
  const params: AcsSearchParams = {
    connectionId: context.connectionId,
    categoryScope: context.categoryScope,
    visitorId: context.visitorId,
    limit: options.limit ?? MAX_RESULTS,
    attributionTokenOut,
  };

  const outcome = await searchWithRelaxation(context.connectionId, filter, (relaxed: CatalogFilter) =>
    acsSearchCatalogProducts(statement, relaxed, params)
  );

  return {
    candidates: outcome.candidates,
    note: relaxationNote(outcome.relaxed),
    attributionToken: attributionTokenOut.current,
    filter,
    steps: outcome.steps,
  };
}
