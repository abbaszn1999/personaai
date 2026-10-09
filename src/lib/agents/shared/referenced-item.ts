import type { CatalogCandidate } from "@/lib/retrieval/types";

/**
 * Which product the shopper's words point at, if any.
 *
 * Resolution is deterministic rather than a model call. Ordinals and pronouns have exact
 * referents in a list the system itself produced, so there is nothing to interpret — and a model
 * that resolves "the second one" correctly 95% of the time is worse here than arithmetic that
 * resolves it always. Getting this wrong fails silently: a confident answer about a product the
 * shopper never meant. So an ordinal only counts inside a phrase that refers to a card ("the
 * second one", "الثاني", "le deuxième"), never in "my first time" or "last week".
 */

const ENGLISH_ORDINALS: Record<string, number> = {
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
  "1st": 1,
  "2nd": 2,
  "3rd": 3,
  "4th": 4,
  "5th": 5,
  "6th": 6,
  "7th": 7,
  "8th": 8,
};

/** Masculine and feminine, standard and Egyptian spellings (التاني, التالت). */
const ARABIC_ORDINALS: Record<string, number> = {
  الأول: 1,
  الاول: 1,
  الأولى: 1,
  الاولى: 1,
  الاولي: 1,
  الثاني: 2,
  الثانية: 2,
  التاني: 2,
  التانية: 2,
  الثالث: 3,
  الثالثة: 3,
  التالت: 3,
  التالتة: 3,
  الرابع: 4,
  الرابعة: 4,
  الخامس: 5,
  الخامسة: 5,
  السادس: 6,
  السادسة: 6,
  السابع: 7,
  السابعة: 7,
  الثامن: 8,
  الثامنة: 8,
  التامن: 8,
  التامنة: 8,
  الأخير: -1,
  الاخير: -1,
  الأخيرة: -1,
  الاخيرة: -1,
};

const FRENCH_ORDINALS: Record<string, number> = {
  premier: 1,
  première: 1,
  premiere: 1,
  deuxième: 2,
  deuxieme: 2,
  second: 2,
  seconde: 2,
  troisième: 3,
  troisieme: 3,
  quatrième: 4,
  quatrieme: 4,
  cinquième: 5,
  cinquieme: 5,
  sixième: 6,
  sixieme: 6,
  septième: 7,
  septieme: 7,
  huitième: 8,
  huitieme: 8,
  dernier: -1,
  dernière: -1,
  derniere: -1,
};

/** Nouns an ordinal describes when it is about time or sequence rather than a card. */
const NOT_A_CARD =
  "time|times|week|weeks|day|days|month|months|year|years|season|order|orders|visit|thing|things|step|of all|minute|night|fois|semaine|année|annee|mois|jour|étape|etape";
const CARD_NOUNS = "one|ones|item|items|option|options|piece|pieces|product|products|card|pick|choice|look";

const ARABIC_DIGITS = /[٠-٩]/g;

function asciiDigits(text: string): string {
  return text.replace(ARABIC_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

function words(table: Record<string, number>): string {
  return Object.keys(table)
    .sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
}

const ENGLISH_WORDS = words(ENGLISH_ORDINALS);
const FRENCH_WORDS = words(FRENCH_ORDINALS);
const ARABIC_WORDS = words(ARABIC_ORDINALS);

/** "the second one", "the 2nd", "second item", "the last" — but never "the first time". */
const ENGLISH_PHRASE = new RegExp(
  `\\b(?:(?:the\\s+)(${ENGLISH_WORDS})(?!\\s+(?:${NOT_A_CARD})\\b)\\b|(${ENGLISH_WORDS})\\s+(?:${CARD_NOUNS})\\b)`,
  "i"
);
/** "le deuxième", "la dernière", "la 2e" — but never "la première fois". */
const FRENCH_PHRASE = new RegExp(
  `(?:^|[^\\p{L}])(?:le|la|l'|celui|celle)\\s*(${FRENCH_WORDS})(?![\\p{L}])(?!\\s+(?:${NOT_A_CARD})(?![\\p{L}]))`,
  "iu"
);
/** A standalone ordinal word; "في الأول" (at first) and "في الأخير" (in the end) are not cards. */
const ARABIC_PHRASE = new RegExp(`(?:^|[^\\p{L}])(?<!في\\s)(?<!ف)(${ARABIC_WORDS})(?![\\p{L}])`, "u");
const NUMBERED = /(?:^|\s|[(\[])(?:#|number\s+|option\s+|item\s+|no\.?\s*|n°\s*|numéro\s+|numero\s+|رقم\s*)(\d{1,2})(?!\d)/iu;

/** "the second one", "#3", "رقم ٢", "le dernier" → a 1-based position, or -1 for last. */
export function parseOrdinalReference(message: string): number | null {
  const text = asciiDigits(message.normalize("NFC"));

  const numeric = text.match(NUMBERED);
  if (numeric) {
    const position = Number(numeric[1]);
    if (position >= 1 && position <= 24) return position;
  }

  const english = text.match(ENGLISH_PHRASE);
  if (english) return ENGLISH_ORDINALS[(english[1] ?? english[2]).toLowerCase()];

  const french = text.match(FRENCH_PHRASE);
  if (french) return FRENCH_ORDINALS[french[1].toLowerCase()];

  const arabic = text.match(ARABIC_PHRASE);
  if (arabic) return ARABIC_ORDINALS[arabic[1]];

  return null;
}

const PRONOUN_PATTERN = /\b(it|that|this|those|these|them|the one|that one|this one)\b/i;
/** Egyptian and standard Arabic demonstratives, and French ones. */
const PRONOUN_PATTERN_OTHER = /(?:^|[^\p{L}])(ده|دي|دا|دى|هذا|هذه|هاد|هادي|celui-ci|celle-ci|celui-là|celle-là|ça|ca)(?![\p{L}])/iu;

export function hasPronounReference(message: string): boolean {
  return PRONOUN_PATTERN.test(message) || PRONOUN_PATTERN_OTHER.test(message);
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
