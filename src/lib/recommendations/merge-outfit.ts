import type { Product } from "@/modules/commerce/types";
import {
  resolveGarmentSlot,
  type GarmentCategory,
} from "@/modules/wearable-agent/utils/fit-metrics";

const DRESS_CONFLICTS = new Set<GarmentCategory>(["dress", "top", "bottom"]);

/**
 * Layers newly requested garments into the working outfit by semantic slot.
 *
 * A new jacket replaces the old jacket but keeps the shirt, trousers, and shoes. A dress
 * replaces separate tops/bottoms, while accessories and other unclassified products stack.
 * New items are applied in order, so the last item wins if a batch contains the same slot
 * more than once.
 */
export function mergeGarmentIntoOutfit(current: Product[], newItems: Product[]): Product[] {
  let merged = [...current];
  let changed = false;

  for (const product of newItems) {
    if (merged.some((item) => item.id === product.id)) continue;
    changed = true;

    const slot = resolveGarmentSlot(product);

    if (slot === "other") {
      merged.push(product);
      continue;
    }

    if (slot === "dress") {
      merged = merged.filter((item) => !DRESS_CONFLICTS.has(resolveGarmentSlot(item)));
    } else if (slot === "top" || slot === "bottom") {
      merged = merged.filter((item) => {
        const currentSlot = resolveGarmentSlot(item);
        return currentSlot !== "dress" && currentSlot !== slot;
      });
    } else {
      merged = merged.filter((item) => resolveGarmentSlot(item) !== slot);
    }

    merged.push(product);
  }

  return changed ? merged : current;
}

/**
 * Whether `next` is the `previous` look plus something new: it keeps every garment already on
 * the look and adds at least one more (a bottom onto a top, say). That is the case where a look
 * is completed in place. A swapped garment (a new top over the old top), a dress replacing a
 * top and bottom, or an identical outfit is a different look and starts its own version.
 */
export function outfitExtendsLook(previous: Product[], next: Product[]): boolean {
  if (previous.length === 0 || next.length <= previous.length) return false;
  const nextIds = new Set(next.map((item) => item.id));
  return previous.every((item) => nextIds.has(item.id));
}