import type { BundleSuggestion, Product } from "@/modules/shopping-agent/types";
import type { IntakeState, WearableChatProfileContext } from "../types";
import { buildBundleSuggestion, selectBundleItems } from "@/lib/recommendations";
import type { StoreCategory } from "@/modules/store/types";

/**
 * Packages multiple same-turn search_catalog results into one "complete the look" bundle —
 * replaces the old static MOCK_BUNDLES / first-N picks with a deterministic, scored selection
 * that prefers garment-role diversity, budget fit, stock, and color compatibility.
 */
export function buildBundleFromSearches(
  searchResultsThisTurn: Product[][],
  intake: IntakeState,
  profile: WearableChatProfileContext,
  categories: StoreCategory[] = [],
  outfitItems: Product[] = []
): BundleSuggestion | null {
  if (searchResultsThisTurn.length < 2) return null;

  const products = selectBundleItems(searchResultsThisTurn, {
    profile,
    intake,
    categories,
    outfitItems,
  });

  return buildBundleSuggestion(products, intake);
}
