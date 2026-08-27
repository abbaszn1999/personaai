import { getProductGroup } from "@/lib/catalog/acs/catalog-reads";
import type { RetrievalContext } from "@/lib/retrieval/types";
import { describeAnchorKnowledge } from "../../anchor";
import type { ModeOutcome } from "../mode-outcome";

/**
 * "Does that come in navy?" — a direct, *verified* lookup, never a search.
 *
 * The only source of truth for "is this an option of the anchor" is the anchor's own
 * `productGroupId`: everything in that group is a colourway/size ACS itself associated with
 * this exact product at import time. There used to be a second path here — a scoped cosine
 * search over the anchor's category/brand when no group existed — but a category+brand match is
 * not evidence that a result is an *option of this item*; it is evidence it is a similar item.
 * That distinction is invisible to a shopper who just asked "does this come in navy" and got
 * back a different, unrelated jacket presented with the same confidence as a real answer — the
 * harmful case this mode exists to prevent, not cause. If there is no product group, or the
 * group has no other members, the honest answer is that no verified alternative exists, not a
 * guess dressed up as one.
 */
export async function runVariantMode(context: RetrievalContext): Promise<ModeOutcome> {
  const anchor = context.anchor;

  if (!anchor) {
    // Without an anchor there is nothing to look up a variant *of*. Saying so is better than
    // running a search that answers a question the shopper didn't ask.
    return { candidates: [], note: "Ask the shopper which item they mean before looking up other options." };
  }

  const known = describeAnchorKnowledge(anchor) ?? undefined;

  if (anchor.productGroupId) {
    const group = await getProductGroup(context.connectionId, anchor.productGroupId, context.categoryScope);
    const siblings = group.filter((candidate) => candidate.externalId !== anchor.externalId);

    if (siblings.length > 0) {
      return { candidates: siblings, note: known };
    }
  }

  // No verified group, or a group of exactly one. Zero candidates lets `engine.ts`'s
  // `noCandidates` report this honestly (leading with `known`) instead of this mode
  // substituting an unrelated "similar item" for the one actually asked about.
  return { candidates: [], note: known };
}
