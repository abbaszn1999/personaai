import type { CatalogCandidate, CatalogFilter } from "@/lib/retrieval/types";
import type { RelaxationStep, RelaxationTrace } from "../search";

/**
 * The contract every skill's `run` returns, plus the pieces more than one skill needs.
 *
 * Lives beside the skill folders rather than inside any one of them: `filter/`, `cosine/`,
 * `bundle/` and `attribute-variant/` all speak in `ModeOutcome`, so putting it in one of them
 * would make the others import from a sibling for no reason.
 */

export interface ModeOutcome {
  candidates: CatalogCandidate[];
  note?: string;
  /** Set by every skill that reaches ACS, and passed back out so the turn's later try-on and
   *  add-to-cart events attribute to the search that surfaced the product. */
  attributionToken?: string;
  /** Diagnostics, carried out to `runRetrieval` so one place logs the whole story rather than
   *  each mode logging its own half. Never read by anything the shopper sees. */
  filter?: CatalogFilter;
  steps?: RelaxationTrace[];
}

export interface CosineOptions {
  /** Set in bundle mode, where each category is resolved separately. */
  targetCategory?: string | null;
  /** Overrides the filter the builder would have produced — bundle mode already knows the
   *  category it is filling. */
  filterOverride?: CatalogFilter;
  limit?: number;
}

/** Cap on what one call ever shows. Keeps the carousel usable and the model's summary bounded
 *  regardless of how many rows matched. */
export const MAX_RESULTS = 10;

export function relaxationNote(relaxed: RelaxationStep["relaxed"]): string | undefined {
  switch (relaxed) {
    case "price-ceiling":
      // Say so explicitly. Quietly showing something over budget reads as not listening.
      return "Nothing matched within that budget, so these are the closest options slightly above it.";
    case "price-floor":
      // The mirror image, and it must not borrow the ceiling's wording: a shopper who asked for
      // a minimum price and is told nothing was "within budget" is being answered about a
      // constraint they never set.
      return "Nothing matched at or above that price, so these are the closest options below it.";
    case "brand":
      return "That brand had nothing matching, so these are similar pieces from other brands.";
    case "garment-type":
      // Named rather than glossed: a shopper who asked for a jacket and is shown coats should be
      // told that is what happened, not left to notice.
      return "Nothing matched that exact piece, so these are related styles in the same family.";
    case "subcategory":
      return "Nothing matched that exact style, so this is the wider category.";
    default:
      return undefined;
  }
}
