import { getGarmentCategory, resolveGarmentSlot } from "@/modules/wearable-agent/utils/fit-metrics";
import type { Product } from "@/modules/shopping-agent/types";

/**
 * Guards against cross-category leakage in search results — e.g. a shopper asking for
 * "shoes" getting a jacket back too. This happens either because a merchant's own category
 * tagging is inconsistent, or because our search fell all the way back to a last-resort
 * browse scoped across *every* merchant-selected category (not just the one asked for).
 *
 * Only filters when the request text clearly names one concrete garment type — ambiguous
 * or broad requests (e.g. "casual outfit") are left untouched since we can't confidently
 * tell what does or doesn't belong. Also fails open: if applying the filter would wipe out
 * every result (e.g. the merchant's data really is mismatched across the board), the
 * unfiltered list is returned rather than showing the shopper nothing at all.
 */
export function filterToRequestedGarmentCategory(products: Product[], requestText: string): Product[] {
  const requested = getGarmentCategory(requestText);
  if (requested === "other") return products;

  const filtered = products.filter((p) => {
    const actual = resolveGarmentSlot(p);
    return actual === "other" || actual === requested;
  });

  return filtered.length > 0 ? filtered : products;
}
