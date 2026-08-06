/** Filler words the model tends to include when it turns a shopper's request into a search
 *  query (e.g. "show me products in jackets category" or "warm winter outfit") — none of
 *  these are ever part of a real product title, so keeping them in the search string is what
 *  causes an otherwise-literal store search (WooCommerce especially) to come back empty. */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "for", "of", "to", "in", "on", "at", "by", "with", "from",
  "is", "are", "be", "been", "was", "were",
  "show", "me", "find", "get", "give", "some", "any", "all", "please", "can", "you", "i", "need",
  "want", "looking", "look", "build", "make",
  "products", "product", "items", "item", "category", "categories", "available", "despite", "what",
  "they", "my", "your", "our", "their", "its", "it", "do", "does", "have", "has", "had", "that",
  "this", "those", "these", "outfit", "outfits", "full", "of", "clothes", "clothing",
]);

/** Lowercased, stopword-filtered, deduped significant words from a free-text query. */
export function extractKeywords(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
  return [...new Set(tokens)];
}

/**
 * Builds an ordered list of query strings to progressively try against a merchant's search
 * endpoint. Real store search backends (WooCommerce's REST `search` param especially) do a
 * fairly literal phrase/substring match, so a natural-language sentence from the LLM almost
 * never matches a product title verbatim. This falls from the full phrase down through a
 * stopword-stripped version to individual significant words, so "warm winter outfit" still
 * finds real "jacket"/"parka" results instead of coming back empty.
 */
export function buildQueryFallbackChain(query: string): string[] {
  const trimmed = query.trim();
  const chain: string[] = [];
  if (trimmed) chain.push(trimmed);

  const keywords = extractKeywords(trimmed);
  const strippedPhrase = keywords.join(" ");
  if (strippedPhrase && strippedPhrase.toLowerCase() !== trimmed.toLowerCase() && !chain.includes(strippedPhrase)) {
    chain.push(strippedPhrase);
  }

  // Longest words first — more specific/likely to be the actual garment or material term
  // (e.g. "leather" or "jacket" over a short, generic word).
  const singleWords = [...keywords].sort((a, b) => b.length - a.length).slice(0, 3);
  for (const word of singleWords) {
    if (!chain.includes(word)) chain.push(word);
  }

  return chain;
}
