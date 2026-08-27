import type { AnchorState, CatalogCandidate, DiscussedBundleItem } from "@/lib/retrieval/types";
import { matchCategoryWords } from "./modes/bundle/category-keywords";

/**
 * Anchor tracking: which product the conversation is currently "about".
 *
 * This is the quiet dependency under `attribute_variant` and all of bundle mode. It is also
 * the one that fails *silently*: resolving "does that come in navy" to the wrong item returns
 * a confident, well-formed answer about a product the shopper never mentioned. Every other
 * failure in the system at least looks like a failure.
 *
 * Resolution is deliberately deterministic rather than a model call. Ordinals and pronouns
 * have exact referents in a list the system itself produced, so there is nothing to interpret —
 * and a model that resolves "the second one" correctly 95% of the time is worse here than
 * arithmetic that resolves it always.
 */

/**
 * Flattens a candidate's `categoryPaths` down to the 2-level view the anchor needs: the primary
 * path's root and, when the chain goes deeper than one level, its own most specific tag. A
 * follow-up filter or cosine call only ever needs "roughly what kind of thing is this", not the
 * full chain a 3+ level store might carry.
 */
export function toAnchor(candidate: CatalogCandidate): AnchorState {
  const primary = candidate.categoryPaths[0] ?? null;

  return {
    externalId: candidate.externalId,
    productGroupId: candidate.productGroupId,
    title: candidate.title,
    brand: candidate.brand,
    category: primary?.[0] ?? null,
    subcategory: primary && primary.length > 1 ? primary[primary.length - 1] : null,
    enrichedDescription: candidate.enrichedDescription,
    attributes: candidate.attributes,
    garmentCategory: candidate.garmentCategory,
  };
}

/**
 * Renders whatever this anchor's description and attribute bag actually hold, generically —
 * the one thing that lets a pinned or just-shown item answer a question about itself from
 * context instead of a fresh search. Deliberately names no attribute: it only ever iterates
 * whatever keys are present for this particular product, because the real list is defined by
 * each merchant's own store, not by this app. Returns null when there is nothing to say beyond
 * the title/price/stock the caller already has.
 */
export function describeAnchorKnowledge(anchor: AnchorState): string | null {
  const parts: string[] = [];
  if (anchor.enrichedDescription) parts.push(anchor.enrichedDescription);

  const attributeEntries = Object.entries(anchor.attributes ?? {}).filter(([, values]) => values.length > 0);
  if (attributeEntries.length > 0) {
    parts.push(attributeEntries.map(([key, values]) => `${key}: ${values.join(", ")}`).join("; "));
  }

  return parts.length > 0 ? parts.join(" — ") : null;
}

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  last: -1,
};

/** "the second one", "#3", "number 2", "the last one" → a 1-based position, or -1 for last. */
export function parseOrdinalReference(message: string): number | null {
  const text = message.toLowerCase();

  for (const [word, position] of Object.entries(ORDINAL_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return position;
  }

  const numeric = text.match(/(?:^|\s)(?:#|number\s+|option\s+|no\.?\s*)(\d{1,2})\b/);
  if (numeric) {
    const position = Number(numeric[1]);
    if (position >= 1 && position <= 20) return position;
  }

  return null;
}

const PRONOUN_PATTERN = /\b(it|that|this|those|these|them|the one|that one|this one)\b/i;

export function hasPronounReference(message: string): boolean {
  return PRONOUN_PATTERN.test(message);
}

/** Matches a product the shopper named outright, longest title first so "Linen Shirt Long" is
 *  preferred over "Linen Shirt" when both are on screen. */
export function matchByTitle(message: string, candidates: CatalogCandidate[]): CatalogCandidate | null {
  const text = message.toLowerCase();

  const byLength = [...candidates].sort((a, b) => b.title.length - a.title.length);
  for (const candidate of byLength) {
    if (candidate.title.length >= 4 && text.includes(candidate.title.toLowerCase())) return candidate;
  }

  return null;
}

export interface ResolveAnchorInput {
  message: string;
  /** The products shown in the most recent results, in the order the shopper saw them —
   *  ordinals are meaningless against any other ordering. */
  lastShown: CatalogCandidate[];
  /** Whatever was already anchored before this message. */
  current: AnchorState | null;
  /** True when `current` came from the shopper clicking Select rather than from their wording. */
  pinned?: boolean;
}

/**
 * Resolves what the shopper is referring to.
 *
 * Precedence runs from most explicit to least: a named title beats a pin, a pin beats an ordinal,
 * an ordinal beats a pronoun, and a pronoun falls back to the existing anchor. Returning null when
 * nothing matches is deliberate — the caller asks which item they meant, which is far better
 * than guessing at the first result and being confidently wrong.
 *
 * A pin sits second because it is the one input here the shopper made deliberately and can see:
 * it is displayed back to them above the composer, so inference quietly overriding it would put
 * the UI and the conversation into different states. Naming a different product outright still
 * wins, since that is at least as explicit as the click and leaves nothing to interpret.
 */
/**
 * Resolves a free-text swap request ("replace the pants", "different shirt and pants") against
 * the bundle the shopper is currently discussing.
 *
 * No click is required — see the architecture brief's Scenario B — so this has to figure out
 * *which* discussed item the words refer to from the same category vocabulary
 * `detectBundleScope` already uses. Deliberately returns every match rather than the first: "a
 * different shirt and pants" names two items in one message, and each is resolved the same way,
 * once per match, with no separate mechanism.
 */
export function resolveBundleSwapTargets(
  message: string,
  discussed: DiscussedBundleItem[] | null | undefined
): DiscussedBundleItem[] {
  if (!discussed || discussed.length === 0) return [];

  const wordCategories = new Set(matchCategoryWords(message));
  if (wordCategories.size === 0) return [];

  return discussed.filter((item) => wordCategories.has(item.category));
}

export function resolveAnchor(input: ResolveAnchorInput): AnchorState | null {
  const named = matchByTitle(input.message, input.lastShown);
  if (named) return toAnchor(named);

  if (input.pinned && input.current) return input.current;

  const ordinal = parseOrdinalReference(input.message);
  if (ordinal !== null && input.lastShown.length > 0) {
    const index = ordinal === -1 ? input.lastShown.length - 1 : ordinal - 1;
    // An out-of-range ordinal ("the fifth one" against three results) is a misunderstanding,
    // not a reason to silently substitute the last item.
    if (index >= 0 && index < input.lastShown.length) return toAnchor(input.lastShown[index]);
    return null;
  }

  if (hasPronounReference(input.message)) {
    if (input.current) return input.current;
    // A pronoun with exactly one thing on screen is unambiguous. With several, it isn't.
    if (input.lastShown.length === 1) return toAnchor(input.lastShown[0]);
    return null;
  }

  return input.current;
}
