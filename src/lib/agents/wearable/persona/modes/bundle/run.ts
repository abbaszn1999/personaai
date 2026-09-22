import type { BundleOption, CatalogCandidate, RetrievalContext, BundleState } from "@/lib/retrieval/types";
import { acsFilterCatalogProducts } from "@/lib/catalog/acs/search-adapter";
import { selectBundles, type BundleCandidatePool } from "../../../stylist";
import { filterValidBundles } from "../../hard-rules";
import { MIN_USEFUL_RESULTS } from "../../search";
import { runCosineMode } from "../cosine";
import { DEFAULT_FULL_OUTFIT_SCOPE, matchCategoryWords, matchesFullOutfitPhrase } from "./category-keywords";

/** Candidates per category handed to the vision call — a literal ~100 per category, not a
 *  shared cross-category total, now that the Budget Allocator trims each pool to what its own
 *  budget share affords before this many ever reach the vision call. Deliberately a knob rather
 *  than a constant chosen on the assumption that more always helps: the real ceiling is the
 *  model's own ~3,000-images-per-prompt limit and per-call cost, since the 100MB `generateContent`
 *  inline-request cap has room to spare at this encoding (see `VISION_IMAGE_MAX_PX` in
 *  `lib/ai/gemini.ts`). */
const CANDIDATES_PER_CATEGORY = Math.max(Number(process.env.BUNDLE_CANDIDATES_PER_CATEGORY) || 100, 4);

/**
 * Reads which categories the shopper named when scoping the bundle.
 *
 * This is what gates the second ask: "resolve everything at once" may only be offered when the
 * shopper named the full scope up front. Offering it to someone who asked for one shirt would
 * invent a commitment they never made.
 *
 * Named garments always win over the "whole thing" phrasing: "a full outfit with a leather
 * jacket" should scope to that jacket plus the default rather than losing the jacket to a
 * fixed list. Only when *nothing* nameable is found does an "outfit"/"bundle"/"look" phrase get
 * a chance to mean something — otherwise a bare "full outfit" (or the app's own "A full outfit"
 * quick-reply, which contains no garment noun at all) returns empty and the strict gate below
 * re-asks the same unanswerable question forever.
 */
export function detectBundleScope(message: string): string[] {
  const named = matchCategoryWords(message);
  if (named.length > 0) return named;
  return matchesFullOutfitPhrase(message) ? DEFAULT_FULL_OUTFIT_SCOPE : [];
}

/** Categories still to fill: the named scope minus whatever is already locked in. */
export function remainingCategories(state: BundleState): string[] {
  const locked = new Set(Object.keys(state.locked));
  return state.scope.filter((category) => !locked.has(category));
}

/**
 * The filter every category pool shares, regardless of whether the AI-written statement that
 * turn's semantic search comes back thin.
 */
function categoryFilter(context: RetrievalContext, category: string) {
  return {
    garmentCategory: category,
    priceMax: context.budgetMax,
    priceMin: context.budgetMin,
    inStockOnly: true,
    excludeExternalIds: context.shownExternalIds,
  };
}

/**
 * Narrows one remaining category with the same filter-then-cosine step every other mode uses,
 * falling back to a filter-only browse of that category alone when the semantic search comes
 * back thin.
 *
 * The fallback exists because the AI-written statement is a single live call with nothing to
 * check it against, and Google's ranking turns out to be sensitive enough to exact wording that
 * two near-identical phrasings for the same category can return 100 results or zero — confirmed
 * directly against this app's own catalog, not assumed. Every other mode's relaxation ladder
 * gives up price, brand and subcategory constraints one at a time when a filter is too narrow;
 * this is the equivalent move for the one thing on that ladder no mode could relax before —
 * the statement itself, whose wording carries no promise about how many results it returns. The
 * category/price/stock filter alone reliably returns full pages regardless of the statement's
 * luck, so it is a safe fallback rather than a guess.
 *
 * A category that is thin because it is genuinely thin (the merchant carries three ties) filters
 * identically whether or not the statement helped, so falling back never manufactures results
 * that were never there.
 */
async function buildCategoryPool(context: RetrievalContext, category: string): Promise<BundleCandidatePool> {
  const filterOverride = categoryFilter(context, category);

  const outcome = await runCosineMode(context, {
    targetCategory: category,
    filterOverride,
    limit: CANDIDATES_PER_CATEGORY,
  });

  if (outcome.candidates.length >= MIN_USEFUL_RESULTS) {
    console.log(`[persona bundle pool] category=${category} candidates=${outcome.candidates.length} source=statement`);
    return { category, candidates: outcome.candidates };
  }

  const browsed = await acsFilterCatalogProducts(filterOverride, {
    connectionId: context.connectionId,
    categoryScope: context.categoryScope,
    visitorId: context.visitorId,
    limit: CANDIDATES_PER_CATEGORY,
    meter: context.meter,
  });

  // The thin statement result is still real and still on-category, so it is kept as a top-up
  // rather than replaced outright — a statement that scored 2 genuinely on-style matches
  // shouldn't lose them to a browse pass that scores by recency/popularity alone.
  const seen = new Set(outcome.candidates.map((candidate) => candidate.externalId));
  const merged = [...outcome.candidates, ...browsed.filter((candidate) => !seen.has(candidate.externalId))];

  console.log(
    `[persona bundle pool] category=${category} candidates=${merged.length} source=browse-fallback ` +
      `(statement alone returned ${outcome.candidates.length})`
  );
  return { category, candidates: merged };
}

/**
 * Narrows each remaining category with the same filter-then-cosine step every other mode uses,
 * built from the anchor's details plus what the shopper asked for.
 *
 * Recomputed on every refinement rather than cached. Retrieval is local now, so rebuilding the
 * pool costs a vector query instead of a store API call — which is what makes "show me
 * different options" able to genuinely widen the pool rather than reshuffle a stale one.
 */
export async function buildCandidatePools(
  context: RetrievalContext,
  categories: string[]
): Promise<BundleCandidatePool[]> {
  const pools = await Promise.all(categories.map((category) => buildCategoryPool(context, category)));

  // Preserve empty pools. Dropping one here changes a requested three-category outfit into a
  // two-category stylist input, which can then be mislabeled as a "complete look". The engine
  // must see which requested category failed and stop before the stylist call. A pool only
  // reaches this empty now when the category/price/stock filter itself matches nothing — the
  // browse fallback above already covers every case where the filter was fine but the wording
  // wasn't.
  return pools;
}

/**
 * Asks the stylist for outfits, then applies this store's own combination rules.
 *
 * The split matters: the stylist judges what goes with what and knows nothing about the
 * merchant, and rejection happens here. Rejecting rather than repairing is deliberate —
 * swapping an item to satisfy a price spread would silently discard the styling judgement that
 * was the entire reason for the call — and asking for several options up front is what makes
 * rejection affordable.
 */
export async function assembleBundles(
  context: RetrievalContext,
  pools: BundleCandidatePool[],
  anchor: CatalogCandidate | null
): Promise<BundleOption[]> {
  const proposed = await selectBundles({
    query: context.query,
    styleGuide: context.styleGuide,
    apiKey: context.apiKey,
    pools,
    anchor,
    meter: context.meter,
  });

  return filterValidBundles(proposed, context.hardRules).map((bundle) => ({
    externalIds: bundle.items.map((item) => item.externalId),
    items: bundle.items.map((item) => ({
      externalId: item.externalId,
      category: item.garmentCategory,
      price: item.price,
    })),
    rationale: bundle.rationale,
  }));
}

/** Every distinct candidate across the pools, so the caller can render the products the
 *  bundles refer to without a second query. */
export function poolProducts(pools: BundleCandidatePool[], anchor: CatalogCandidate | null): CatalogCandidate[] {
  const seen = new Map<string, CatalogCandidate>();
  if (anchor) seen.set(anchor.externalId, anchor);
  for (const pool of pools) {
    for (const candidate of pool.candidates) seen.set(candidate.externalId, candidate);
  }
  return [...seen.values()];
}
