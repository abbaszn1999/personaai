import type { Product } from "@/modules/shopping-agent/types";
import type { StoreCategory } from "@/modules/store/types";
import { extractKeywords } from "@/lib/catalog/query-helpers";

/**
 * Guards against cross-category leakage in search results — e.g. a shopper asking for
 * "routers" getting a vacuum back too. This happens either because a merchant's own category
 * tagging is inconsistent, or because search fell all the way back to a last-resort browse
 * scoped across *every* merchant-selected category (not just the one asked for). Mirrors the
 * wearable agent's filterToRequestedGarmentCategory, but general merchandise has no fixed
 * taxonomy like garment slots — instead this resolves the request against the merchant's own
 * synced store categories.
 *
 * Only filters when the request text (or an explicit category id) clearly resolves to one of
 * the merchant's categories — ambiguous or generic requests (e.g. "something for my office")
 * are left untouched since we can't confidently tell what does or doesn't belong. Also fails
 * open: if applying the filter would wipe out every result, the unfiltered list is returned
 * rather than showing the shopper nothing at all.
 */
export function filterToRequestedCategory(
  products: Product[],
  requestText: string,
  categories: StoreCategory[]
): Product[] {
  const targetId = resolveRequestedCategoryId(requestText, categories);
  if (!targetId) return products;

  // Keep products explicitly tagged with the requested category, plus anything with no
  // (or unknown) category — same "keep unclassified rather than false-drop" rule as
  // wearable's "other" slot.
  const filtered = products.filter((p) => !p.categoryId || p.categoryId === targetId);

  return filtered.length > 0 ? filtered : products;
}

function resolveRequestedCategoryId(requestText: string, categories: StoreCategory[]): string | null {
  if (categories.length === 0) return null;

  // The request text passed in is always built as `${categoryId ?? ""} ${query}` by the
  // caller, so a literal category id embedded in it is an explicit, unambiguous signal —
  // check that before falling back to fuzzy name matching.
  for (const cat of categories) {
    if (cat.id && requestText.includes(cat.id)) return cat.id;
  }

  const requestTokens = extractKeywords(requestText);
  if (requestTokens.length === 0) return null;

  // Loose singular/plural-tolerant containment ("router" <-> "routers") rather than exact
  // token equality — real category names and shopper phrasing rarely match to the letter.
  const tokenMatches = (nameToken: string) =>
    requestTokens.some((rt) => rt.includes(nameToken) || nameToken.includes(rt));

  let best: { id: string; overlap: number } | null = null;
  for (const cat of categories) {
    const nameTokens = extractKeywords(cat.name);
    if (nameTokens.length === 0) continue;
    // Require every token in the category's name to appear in the request — avoids matching
    // on a single generic word a category name happens to share with an unrelated query.
    const hits = nameTokens.filter(tokenMatches).length;
    if (hits === nameTokens.length && (!best || hits > best.overlap)) {
      best = { id: cat.id, overlap: hits };
    }
  }

  return best?.id ?? null;
}
