import type { CatalogCandidate, CatalogFilter } from "@/lib/retrieval/types";

/**
 * Deliberately free of catalog-client imports. The relaxation ladder is the piece most worth
 * testing — a wrong order is invisible in production, since every rung returns *something* —
 * and pulling a live client in here would make that test require a real configuration. The
 * query adapters live with the skills that use them instead.
 */

/** One rung of the relaxation ladder: what was given up, and the filter that remains. */
export interface RelaxationStep {
  /** What was dropped to widen the search. `null` on the first rung, which drops nothing. The
   *  two price bounds are separate rungs because they are separate concessions: showing
   *  something over a stated budget and showing something under a stated minimum are different
   *  things to admit to, and a shopper who stated only one of them must never be told about
   *  the other. */
  relaxed: "price-ceiling" | "price-floor" | "brand" | "subcategory" | "garment-type" | null;
  filter: CatalogFilter;
}

/**
 * The order constraints are given up in when a valid filter legitimately returns nothing.
 *
 * The order is a judgement about what a shopper minds losing, cheapest first. A price ceiling
 * goes first because seeing something slightly over budget is useful information; a stated price
 * floor goes next, since a shopper who set one usually meant it as a quality signal rather than
 * a hard rule; brand follows because a substitute is still the right kind of item; then the two
 * subcategories widen to their parents, because that is the closest thing to changing what they
 * asked for. Neither category is ever dropped — at that point the honest answer is a question,
 * not more results.
 *
 * `garmentSubcategory` gives way before the store's own `subcategory` because it is the narrower
 * claim of the two: dropping "jacket" still leaves outerwear, which a shopper who asked for a
 * jacket will mostly accept, while dropping a merchant's "Clothing" leaves only "Men".
 */
export function buildRelaxationLadder(filter: CatalogFilter): RelaxationStep[] {
  const ladder: RelaxationStep[] = [{ relaxed: null, filter }];
  let current = filter;

  if (current.priceMax !== undefined) {
    current = { ...current };
    delete current.priceMax;
    ladder.push({ relaxed: "price-ceiling", filter: current });
  }

  if (current.priceMin !== undefined) {
    current = { ...current };
    delete current.priceMin;
    ladder.push({ relaxed: "price-floor", filter: current });
  }

  if (current.brand !== undefined) {
    current = { ...current };
    delete current.brand;
    ladder.push({ relaxed: "brand", filter: current });
  }

  // Only widens as far as the parent garment category, which `applyGarmentFields` guarantees is
  // set whenever the subcategory is.
  if (current.garmentSubcategory !== undefined) {
    current = { ...current };
    delete current.garmentSubcategory;
    ladder.push({ relaxed: "garment-type", filter: current });
  }

  if (current.subcategory !== undefined) {
    current = { ...current };
    delete current.subcategory;
    ladder.push({ relaxed: "subcategory", filter: current });
  }

  return ladder;
}

/** What one rung actually returned. Diagnostics only — never reaches the shopper. A ladder that
 *  reads `none:0 price:0 brand:0` says the filter was never the problem, which is the one thing
 *  an empty result set cannot tell you on its own. */
export interface RelaxationTrace {
  relaxed: RelaxationStep["relaxed"];
  count: number;
}

export interface SearchOutcome {
  candidates: CatalogCandidate[];
  /** Which rung produced the results, so the agent can tell the shopper what it had to give
   *  up instead of presenting a widened result as an exact match. */
  relaxed: RelaxationStep["relaxed"];
  exhausted: boolean;
  steps: RelaxationTrace[];
}

/** Exported so bundle mode's per-category safety net (`buildCandidatePools`) judges "thin" by
 *  the same bar this ladder does, rather than a second number that could silently drift from it. */
export const MIN_USEFUL_RESULTS = 3;

/**
 * Runs a search, widening the filter only as far as it has to.
 *
 * Stops at the first rung that returns a usable number of results rather than always walking
 * to the bottom, so a filter that works is never loosened for no reason.
 */
export async function searchWithRelaxation(
  connectionId: string,
  filter: CatalogFilter,
  run: (filter: CatalogFilter) => Promise<CatalogCandidate[]>
): Promise<SearchOutcome> {
  const ladder = buildRelaxationLadder(filter);
  const steps: RelaxationTrace[] = [];
  let best: SearchOutcome = { candidates: [], relaxed: null, exhausted: true, steps };

  for (const step of ladder) {
    const candidates = await run(step.filter);
    steps.push({ relaxed: step.relaxed, count: candidates.length });

    if (candidates.length >= MIN_USEFUL_RESULTS) {
      return { candidates, relaxed: step.relaxed, exhausted: false, steps };
    }

    // Hold onto a thin-but-non-empty result: if every rung comes back thin, showing two real
    // products beats showing none.
    if (candidates.length > best.candidates.length) {
      best = { candidates, relaxed: step.relaxed, exhausted: false, steps };
    }
  }

  return best.candidates.length > 0 ? best : { candidates: [], relaxed: null, exhausted: true, steps };
}

/**
 * A stable per-conversation seed for filter mode's tie-break.
 *
 * This is the fix for the bug that started the rebuild: with no ordering at all, every shopper
 * asking the same question got the same slice of the same catalog in the same order. Seeding
 * from the conversation keeps results stable within a session while varying across them.
 */
export function seedFromConversation(turns: Array<{ content: string }>): number {
  const basis = turns.map((turn) => turn.content).join("|").slice(0, 512);
  let hash = 0;
  for (let i = 0; i < basis.length; i++) {
    hash = (hash * 31 + basis.charCodeAt(i)) % 1_000_003;
  }
  return hash / 1_000_003;
}
