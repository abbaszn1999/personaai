import type { CatalogCandidate } from "@/lib/retrieval/types";

/**
 * Which product the shopper's words point at, if any.
 *
 * Resolution is deterministic rather than a model call. Ordinals and pronouns have exact
 * referents in a list the system itself produced, so there is nothing to interpret — and a model
 * that resolves "the second one" correctly 95% of the time is worse here than arithmetic that
 * resolves it always. Getting this wrong fails silently: a confident answer about a product the
 * shopper never meant.
 */

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

/** A product the shopper named outright, longest title first so "Linen Shirt Long" is preferred
 *  over "Linen Shirt" when both are on screen. */
export function matchByTitle(message: string, candidates: readonly CatalogCandidate[]): CatalogCandidate | null {
  const text = message.toLowerCase();
  const byLength = [...candidates].sort((a, b) => b.title.length - a.title.length);
  for (const candidate of byLength) {
    if (candidate.title.length >= 4 && text.includes(candidate.title.toLowerCase())) return candidate;
  }
  return null;
}

export interface ResolveReferenceInput {
  message: string;
  /** Products on screen, in the order the shopper saw them. */
  lastShown: readonly CatalogCandidate[];
}

/**
 * A named title beats an ordinal, an ordinal beats a pronoun. A pronoun resolves only when a
 * single product is on screen — with several it is ambiguous and the agent should ask.
 * Returns null when the message points at nothing in particular.
 */
export function resolveReferencedItem(input: ResolveReferenceInput): CatalogCandidate | null {
  const named = matchByTitle(input.message, input.lastShown);
  if (named) return named;

  const ordinal = parseOrdinalReference(input.message);
  if (ordinal !== null && input.lastShown.length > 0) {
    const index = ordinal === -1 ? input.lastShown.length - 1 : ordinal - 1;
    // An out-of-range ordinal ("the fifth one" against three results) is a misunderstanding,
    // not a reason to silently substitute the last item.
    return index >= 0 && index < input.lastShown.length ? input.lastShown[index] : null;
  }

  if (hasPronounReference(input.message) && input.lastShown.length === 1) return input.lastShown[0];
  return null;
}
