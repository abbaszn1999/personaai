import type { BundleSuggestion, Product } from "@/modules/shopping-agent/types";
import { resolveGarmentSlot, type GarmentCategory } from "@/modules/wearable-agent/utils/fit-metrics";
import type { IntakeState } from "@/lib/agents/wearable/persona/types";
import { parseBudgetMax } from "./parse-budget";
import { rankProducts } from "./rank-products";
import type { RankingContext, ScoredProduct } from "./types";

const MAX_BUNDLE_ITEMS = 4;

function colorKey(product: Product): string {
  const color = product.variants.find((v) => v.type === "color");
  return (color?.value || color?.label || "").toLowerCase();
}

function compatibleWithPicked(candidate: Product, picked: Product[]): number {
  if (picked.length === 0) return 1;
  const candidateColor = colorKey(candidate);
  if (!candidateColor) return 0.6;

  let matches = 0;
  let compared = 0;
  for (const item of picked) {
    const other = colorKey(item);
    if (!other) continue;
    compared += 1;
    if (other === candidateColor || other.includes(candidateColor) || candidateColor.includes(other)) {
      matches += 1;
    }
  }
  if (compared === 0) return 0.6;
  return matches / compared;
}

/** Bundle slots are meant to be wearable outfit roles the avatar can actually be dressed in —
 *  "other" (accessories, fragrance, etc.) never fills a Complete Look slot, even if it was one
 *  of the same-turn search buckets. Those items can still surface as plain alternative cards. */
const BUNDLE_ELIGIBLE_ROLES = new Set<GarmentCategory>(["outerwear", "top", "bottom", "shoes", "dress"]);

/**
 * Builds one coordinated bundle from multiple same-turn search buckets.
 * Rule: take at most ONE product from each search bucket (each bucket is one category
 * search — e.g. jackets, then shoes). That prevents nonsense looks like two jackets + shoes.
 * Also enforces garment-role uniqueness so we never stack two tops/shoes.
 */
export function selectBundleItems(
  buckets: Product[][],
  ctx: Omit<RankingContext, "query" | "matchType"> & { query?: string }
): Product[] {
  if (buckets.length < 2) return [];

  const rankedBuckets: ScoredProduct[][] = buckets.map((bucket) =>
    rankProducts(bucket, {
      ...ctx,
      query: ctx.query ?? "",
      matchType: "exact",
    })
  );

  const maxBudget = parseBudgetMax(ctx.intake.budget);
  const picked: Product[] = [];
  const usedRoles = new Set<GarmentCategory>();
  const usedIds = new Set<string>();
  let spend = 0;

  for (const bucket of rankedBuckets) {
    if (picked.length >= MAX_BUNDLE_ITEMS) break;

    let best: { product: Product; score: number; role: GarmentCategory } | null = null;
    for (const scored of bucket) {
      const product = scored.product;
      if (usedIds.has(product.id) || !product.inStock) continue;

      const role = resolveGarmentSlot(product);
      // Non-wearable items (accessories, fragrance, etc.) never occupy a bundle slot.
      if (!BUNDLE_ELIGIBLE_ROLES.has(role)) continue;
      // One role per look — never two jackets, two shoe pairs, etc.
      if (usedRoles.has(role)) continue;
      if (maxBudget !== null && spend + product.price > maxBudget) continue;

      const compatibility = compatibleWithPicked(product, picked);
      const adjusted = scored.score + compatibility * 8;
      if (!best || adjusted > best.score) {
        best = { product, score: adjusted, role };
      }
    }

    // Exactly one pick per search bucket when a valid candidate exists.
    if (best) {
      picked.push(best.product);
      usedIds.add(best.product.id);
      usedRoles.add(best.role);
      spend += best.product.price;
    }
  }

  return picked;
}

export function buildBundleSuggestion(
  products: Product[],
  intake: IntakeState
): BundleSuggestion | null {
  if (products.length < 2) return null;

  const label =
    intake.style && intake.occasion
      ? `${intake.style} ${intake.occasion} Look`
      : intake.style
        ? `${intake.style} Look`
        : intake.occasion
          ? `${intake.occasion} Look`
          : "Complete Look";

  return {
    id: `bundle-${Date.now()}`,
    label,
    productIds: products.map((p) => p.id),
    items: products.map((p) => ({ productId: p.id, category: p.categoryId || null, price: p.price })),
  };
}
