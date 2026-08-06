import type { Product } from "@/modules/shopping-agent/types";
import { recommendSizesForProducts as recommendSized, buildFitNote as buildNote } from "@/lib/recommendations";
import type { WearableChatProfileContext } from "../types";

/**
 * Per-product recommended size — shoes use EU shoe size when available; apparel uses the
 * shared BMI letter-size heuristic already shown on the Model Stats card.
 */
export function recommendSizesForProducts(profile: WearableChatProfileContext, products: Product[]): Record<string, string> {
  return recommendSized(profile, products);
}

/** A fit note grounded in the shopper's real measurements — replaces the old hardcoded
 *  generic string that was shown for every try-on regardless of profile or product. */
export function buildFitNote(profile: WearableChatProfileContext): string {
  return buildNote(profile);
}
