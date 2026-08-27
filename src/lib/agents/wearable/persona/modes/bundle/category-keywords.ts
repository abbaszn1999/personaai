/**
 * The garment vocabulary a shopper actually uses, mapped to the internal taxonomy
 * (`CatalogCandidate.garmentCategory`). Shared by scope detection (a fresh bundle request) and
 * swap resolution (a follow-up naming one item of an existing bundle) so both read a shopper's
 * words against the same vocabulary rather than drifting apart.
 */
export const CATEGORY_KEYWORDS: Array<{ category: string; words: string[] }> = [
  { category: "tops", words: ["top", "tops", "shirt", "tee", "t-shirt", "blouse", "sweater", "hoodie", "polo"] },
  { category: "bottoms", words: ["bottom", "bottoms", "pant", "pants", "trousers", "jeans", "shorts", "skirt", "joggers"] },
  { category: "outerwear", words: ["jacket", "coat", "blazer", "outerwear", "parka"] },
  { category: "dresses", words: ["dress", "jumpsuit", "gown"] },
  { category: "footwear", words: ["shoe", "shoes", "sneakers", "boots", "slippers", "sandals", "heels"] },
  { category: "accessories", words: ["hat", "cap", "beanie", "scarf", "belt", "gloves", "accessory", "accessories"] },
  { category: "bags", words: ["bag", "backpack", "tote", "handbag"] },
  { category: "sleepwear", words: ["pyjama", "pajama", "pyjamas", "pajamas", "robe", "nightdress"] },
];

/** Every canonical category named in `text`, in the order `CATEGORY_KEYWORDS` lists them. */
export function matchCategoryWords(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];

  for (const { category, words } of CATEGORY_KEYWORDS) {
    if (words.some((word) => new RegExp(`\\b${word}\\b`).test(lower)) && !found.includes(category)) {
      found.push(category);
    }
  }

  return found;
}

/**
 * What "the whole thing" means when nothing more specific was named. Deliberately excludes
 * outerwear and accessories — not every outfit needs a jacket, and defaulting to a wider scope
 * than the shopper actually wants means padding a bundle with a category they'll have to
 * decline, rather than one they simply didn't think to ask about first.
 */
export const DEFAULT_FULL_OUTFIT_SCOPE = ["tops", "bottoms", "footwear"];

/**
 * Words meaning "build me the whole thing", as opposed to naming individual pieces. A bare
 * "full outfit" / "a bundle" / "put together a look" contains none of `CATEGORY_KEYWORDS`'
 * garment nouns, so without this, the exact phrase the shopper (and the app's own quick-reply
 * chip, "A full outfit") uses to start a bundle is invisible to scope detection — see
 * `detectBundleScope`.
 */
const FULL_OUTFIT_PHRASE = /\b(outfit|bundle|whole look|full look|complete look|whole set|full set)\b/i;

/** True when the message asks for "the whole thing" rather than naming specific pieces. */
export function matchesFullOutfitPhrase(text: string): boolean {
  return FULL_OUTFIT_PHRASE.test(text);
}
