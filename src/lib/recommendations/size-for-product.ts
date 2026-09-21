import type { Product } from "@/modules/commerce/types";
import type { TryOnProfile } from "@/modules/wearable-agent/types";
import { recommendSize, resolveGarmentSlot } from "@/modules/wearable-agent/utils/fit-metrics";
import type { WearableChatProfileContext } from "@/lib/agents/wearable/persona/types";

function toFitMetricsProfile(profile: WearableChatProfileContext): TryOnProfile {
  return {
    audience: null,
    photoUrl: null,
    photoBase64: null,
    photoMimeType: null,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    shoeSizeEu: profile.shoeSizeEu,
    chestCm: profile.chestCm,
    waistCm: profile.waistCm,
    hipsCm: null,
    avatarUrl: profile.avatarUrl,
    backdropUrl: null,
  };
}

/** True when a variant label roughly matches the recommended size (letters or EU numbers). */
export function variantMatchesSize(label: string, recommended: string): boolean {
  const a = label.trim().toLowerCase();
  const b = recommended.trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  // "EU 42" vs "42"
  const aNum = a.replace(/[^0-9.]/g, "");
  const bNum = b.replace(/[^0-9.]/g, "");
  if (aNum && bNum && aNum === bNum) return true;
  // "Medium" vs "M"
  if (a.startsWith(b) || b.startsWith(a)) return true;
  return false;
}

/**
 * Product-aware size recommendation: shoes use EU shoe size when available; everything else
 * uses the shared BMI letter-size heuristic already shown on the Model Stats card.
 */
export function recommendSizeForProduct(profile: WearableChatProfileContext, product: Product): string {
  const category = resolveGarmentSlot(product);
  if (category === "shoes" && profile.shoeSizeEu) {
    return `EU ${profile.shoeSizeEu}`;
  }
  return recommendSize(toFitMetricsProfile(profile));
}

/** Returns true when the product either has no size variants or has the recommended size in stock. */
export function hasRecommendedSizeInStock(profile: WearableChatProfileContext, product: Product): boolean {
  const recommended = recommendSizeForProduct(profile, product);
  const sizeVariants = product.variants.filter((v) => v.type === "size");
  if (sizeVariants.length === 0) return product.inStock;
  return sizeVariants.some((v) => v.inStock && variantMatchesSize(v.label, recommended));
}

export function recommendSizesForProducts(
  profile: WearableChatProfileContext,
  products: Product[]
): Record<string, string> {
  const sizes: Record<string, string> = {};
  for (const product of products) {
    sizes[product.id] = recommendSizeForProduct(profile, product);
  }
  return sizes;
}

/** A fit note grounded in the shopper's real measurements. */
export function buildFitNote(profile: WearableChatProfileContext): string {
  if (!profile.heightCm || !profile.weightKg) {
    return "Fit is estimated from a standard size chart — add your measurements for a more precise recommendation.";
  }
  const shoe = profile.shoeSizeEu != null ? `, shoe EU ${profile.shoeSizeEu}` : "";
  return `Sized to your profile (${Math.round(profile.heightCm)}cm, ${Math.round(profile.weightKg)}kg${shoe}) — the recommended size above should give a true-to-fit result. Size up for a more relaxed fit.`;
}
