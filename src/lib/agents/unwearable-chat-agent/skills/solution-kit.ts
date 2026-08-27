import type { BundleSuggestion, Product } from "@/modules/shopping-agent/types";
import { parseBudgetMax } from "@/lib/recommendations";
import type { IntakeState, SearchCallResult } from "../types";
import { rankProducts } from "./rank-products";

const MAX_KIT_ITEMS = 4;

/**
 * Packages multiple same-turn search_catalog results into one "Solution Kit" bundle — the
 * unwearable counterpart of the wearable agent's Complete Look. Rule: take at most ONE
 * product from each search bucket (each bucket is one product-type search — e.g. monitors,
 * then keyboards), and never two items from the same store category, so a "home office kit"
 * can't end up as three monitors.
 */
export function buildSolutionKitFromSearches(
  searchCallsThisTurn: SearchCallResult[],
  intake: IntakeState
): BundleSuggestion | null {
  const targeted = searchCallsThisTurn.filter((call) => call.products.length > 0);
  if (targeted.length < 2) return null;

  const maxBudget = parseBudgetMax(intake.budget);
  const picked: Product[] = [];
  const usedIds = new Set<string>();
  const usedCategories = new Set<string>();
  let spend = 0;

  for (const call of targeted) {
    if (picked.length >= MAX_KIT_ITEMS) break;

    const ranked = rankProducts(call.products, {
      intake,
      query: call.query,
      matchType: call.matchType,
    });

    for (const scored of ranked) {
      const product = scored.product;
      if (usedIds.has(product.id) || !product.inStock) continue;
      // One item per store category — prevents e.g. two monitors in one kit even when two
      // different searches both happened to return monitors.
      const categoryKey = product.categoryId || `uncategorized:${product.id}`;
      if (usedCategories.has(categoryKey)) continue;
      if (maxBudget !== null && spend + product.price > maxBudget) continue;

      picked.push(product);
      usedIds.add(product.id);
      usedCategories.add(categoryKey);
      spend += product.price;
      break; // exactly one pick per search bucket
    }
  }

  if (picked.length < 2) return null;

  const label = intake.useCase ? `${intake.useCase} Solution Kit` : "Complete Solution Kit";

  return {
    id: `kit-${Date.now()}`,
    label,
    productIds: picked.map((p) => p.id),
    items: picked.map((p) => ({ productId: p.id, category: p.categoryId || null, price: p.price })),
  };
}
