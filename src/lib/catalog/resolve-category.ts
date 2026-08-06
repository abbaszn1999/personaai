import type { StoreCategory } from "@/modules/store/types";

/** Naive singularization ("Jackets" -> "jacket") so a category name matches regardless of
 *  whether the shopper or model used the singular or plural form. */
export function singularize(s: string): string {
  // Strip a trailing possessive ("Men's" -> "men") before the plural/singular heuristics below —
  // otherwise the apostrophe-s gets swallowed by the generic "s" trim and leaves a dangling
  // apostrophe (e.g. "men'"), which then never matches a shopper's plain-text "men"/"men's".
  const lower = s.toLowerCase().trim().replace(/'s$/, "");
  if (lower.endsWith("ies") && lower.length > 4) return `${lower.slice(0, -3)}y`;
  if (lower.endsWith("ses") && lower.length > 4) return lower.slice(0, -2);
  return lower.endsWith("s") && lower.length > 3 ? lower.slice(0, -1) : lower;
}

/** Known antonym pairs that must never match via substring heuristics (e.g. "women" includes "men"). */
const ANTONYM_PAIRS: Array<[string, string]> = [
  ["men", "women"],
  ["man", "woman"],
  ["boy", "girl"],
  ["boys", "girls"],
  ["male", "female"],
];

function areAntonyms(a: string, b: string): boolean {
  const left = singularize(a);
  const right = singularize(b);
  return ANTONYM_PAIRS.some(
    ([x, y]) =>
      (left === singularize(x) && right === singularize(y)) ||
      (left === singularize(y) && right === singularize(x))
  );
}

/** Exact or singular/plural match only — never bidirectional substring matching. */
function namesEqual(a: string, b: string): boolean {
  if (areAntonyms(a, b)) return false;
  const left = singularize(a);
  const right = singularize(b);
  return left === right;
}

/**
 * Resolves whatever category hint is available into concrete, merchant-selected category ids.
 * Merchants can sync multiple categories that share a display name (e.g. "Jackets" under both
 * Men and Women, with different ids) — a name always resolves to *all* matching ids, so the
 * caller can search across every one of them in a single OR'd request instead of guessing which
 * single id was "the" right one.
 *
 * Resolution order:
 * 1. `requestedCategory` as an exact known id.
 * 2. `requestedCategory` as a category name (exact or singular/plural, never substring).
 * 3. A synced category name mentioned as a whole word in the shopper's free-text `query`.
 */
export function resolveCategoryIds(
  selectedCategories: StoreCategory[],
  requestedCategory: string | undefined,
  query: string
): string[] {
  if (selectedCategories.length === 0) return [];

  if (requestedCategory) {
    const byExactId = selectedCategories.filter((c) => c.id === requestedCategory);
    if (byExactId.length > 0) return byExactId.map((c) => c.id);

    const byName = selectedCategories.filter((c) => namesEqual(c.name, requestedCategory));
    if (byName.length > 0) return byName.map((c) => c.id);
  }

  const lowerQuery = ` ${query.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const matchedByQuery = selectedCategories.filter((c) => {
    const singular = singularize(c.name);
    const plural = `${singular}s`;
    if (singular.length <= 2) return false;
    return lowerQuery.includes(` ${singular} `) || lowerQuery.includes(` ${plural} `);
  });
  if (matchedByQuery.length > 0) return matchedByQuery.map((c) => c.id);

  return [];
}
