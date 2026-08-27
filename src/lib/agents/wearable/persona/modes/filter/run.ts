import { acsFilterCatalogProducts, type AcsSearchParams } from "@/lib/catalog/acs/search-adapter";
import type { CatalogFilter, RetrievalContext } from "@/lib/retrieval/types";
import { MAX_RESULTS, relaxationNote, type ModeOutcome } from "../mode-outcome";
import { searchWithRelaxation } from "../../search";
import { applyHardRules, buildFilter } from "./build-filter";

/**
 * Structural filtering with no ranking step: ACS's `servingConfigs.search` in browse mode
 * (empty query), reissued once per rung of the relaxation ladder.
 *
 * There is deliberately no `seed` parameter the way the pgvector version took one for its RPC's
 * random tie-break — ACS's own browse ranking is what orders same-filter results, and there is
 * no client-side ordering left to seed.
 */
export async function runFilterMode(context: RetrievalContext, limit: number = MAX_RESULTS): Promise<ModeOutcome> {
  const built = await buildFilter({
    query: context.query,
    recentTurns: context.recentTurns,
    facets: context.facets,
    apiKey: context.apiKey,
    anchorCategory: context.anchor?.category,
    budgetMax: context.budgetMax,
    budgetMin: context.budgetMin,
  });

  const filter = applyHardRules(
    { ...built.filter, excludeExternalIds: context.shownExternalIds },
    context.hardRules
  );

  const attributionTokenOut: { current?: string } = {};
  const params: AcsSearchParams = {
    connectionId: context.connectionId,
    categoryScope: context.categoryScope,
    visitorId: context.visitorId,
    limit,
    attributionTokenOut,
  };

  const outcome = await searchWithRelaxation(context.connectionId, filter, (relaxed: CatalogFilter) =>
    acsFilterCatalogProducts(relaxed, params)
  );

  return {
    candidates: outcome.candidates,
    note: relaxationNote(outcome.relaxed),
    attributionToken: attributionTokenOut.current,
    filter,
    steps: outcome.steps,
  };
}
