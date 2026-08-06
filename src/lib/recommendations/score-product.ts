import type { Product } from "@/modules/shopping-agent/types";
import { resolveGarmentSlot } from "@/modules/wearable-agent/utils/fit-metrics";
import { extractKeywords } from "@/lib/catalog/query-helpers";
import { parseBudgetMax } from "./parse-budget";
import { hasRecommendedSizeInStock } from "./size-for-product";
import type { RankingContext, ScoredProduct, ScoreBreakdown } from "./types";

const WEIGHTS = {
  textRelevance: 28,
  intakeFit: 18,
  budgetFit: 16,
  stockFit: 14,
  sizeFit: 12,
  outfitCompatibility: 7,
  matchConfidence: 5,
} as const;

function tokenize(...parts: Array<string | undefined | null>): string[] {
  return extractKeywords(parts.filter(Boolean).join(" "));
}

function overlapScore(haystack: string[], needles: string[]): number {
  if (needles.length === 0) return 0;
  const set = new Set(haystack);
  let hits = 0;
  for (const needle of needles) {
    if (set.has(needle)) hits += 1;
    else if ([...set].some((token) => token.includes(needle) || needle.includes(token))) hits += 0.5;
  }
  return Math.min(1, hits / needles.length);
}

function productTokens(product: Product): string[] {
  return tokenize(product.name, product.description, ...product.tags, product.categoryId);
}

function colorTokens(product: Product): string[] {
  return product.variants
    .filter((v) => v.type === "color")
    .flatMap((v) => tokenize(v.label, v.value));
}

function scoreTextRelevance(product: Product, query: string): { score: number; reason?: string } {
  const needles = tokenize(query);
  if (needles.length === 0) return { score: 0.35 };
  const score = overlapScore(productTokens(product), needles);
  return score > 0
    ? { score, reason: "Matches the shopper's search terms" }
    : { score: 0.1 };
}

function scoreIntakeFit(product: Product, ctx: RankingContext): { score: number; reason?: string } {
  const needles = tokenize(ctx.intake.style, ctx.intake.occasion);
  if (needles.length === 0) return { score: 0.4 };
  const score = overlapScore(productTokens(product), needles);
  return score > 0
    ? { score: Math.max(0.35, score), reason: "Fits stated style/occasion preferences" }
    : { score: 0.2 };
}

function scoreBudgetFit(product: Product, ctx: RankingContext): { score: number; reason?: string } {
  const max = parseBudgetMax(ctx.intake.budget);
  if (max === null) return { score: 0.6 };
  if (product.price <= 0) return { score: 0.3 };
  if (product.price <= max * 0.7) return { score: 1, reason: "Well within budget" };
  if (product.price <= max) return { score: 0.85, reason: "Within budget" };
  if (product.price <= max * 1.15) return { score: 0.35 };
  return { score: 0.05 };
}

function scoreStockFit(product: Product): { score: number; reason?: string } {
  if (!product.inStock) return { score: 0 };
  return { score: 1, reason: "In stock" };
}

function scoreSizeFit(product: Product, ctx: RankingContext): { score: number; reason?: string } {
  if (hasRecommendedSizeInStock(ctx.profile, product)) {
    return { score: 1, reason: "Recommended size available" };
  }
  const hasSizes = product.variants.some((v) => v.type === "size");
  if (!hasSizes) return { score: 0.55 };
  return { score: 0.2 };
}

function scoreOutfitCompatibility(product: Product, ctx: RankingContext): { score: number; reason?: string } {
  const outfit = ctx.outfitItems ?? [];
  if (outfit.length === 0) return { score: 0.5 };

  const productCategory = resolveGarmentSlot(product);
  const outfitCategories = new Set(outfit.map((p) => resolveGarmentSlot(p)));
  // Prefer complementary garment roles over stacking another top/top.
  const diversifies = !outfitCategories.has(productCategory) || productCategory === "other";
  const colorOverlap = overlapScore(
    colorTokens(product),
    outfit.flatMap((p) => colorTokens(p))
  );

  const score = (diversifies ? 0.7 : 0.25) + colorOverlap * 0.3;
  return {
    score: Math.min(1, score),
    reason: diversifies ? "Complements current outfit roles" : undefined,
  };
}

function scoreMatchConfidence(ctx: RankingContext): number {
  switch (ctx.matchType) {
    case "exact":
      return 1;
    case "partial":
      return 0.7;
    case "broad":
      return 0.35;
    default:
      return 0.1;
  }
}

/** Deterministic single-product score used for ranking and bundle selection. */
export function scoreProduct(product: Product, ctx: RankingContext): ScoredProduct {
  const text = scoreTextRelevance(product, ctx.query);
  const intake = scoreIntakeFit(product, ctx);
  const budget = scoreBudgetFit(product, ctx);
  const stock = scoreStockFit(product);
  const size = scoreSizeFit(product, ctx);
  const outfit = scoreOutfitCompatibility(product, ctx);
  const matchConfidence = scoreMatchConfidence(ctx);

  const breakdown: ScoreBreakdown = {
    textRelevance: text.score,
    intakeFit: intake.score,
    budgetFit: budget.score,
    stockFit: stock.score,
    sizeFit: size.score,
    outfitCompatibility: outfit.score,
    matchConfidence,
  };

  const score =
    breakdown.textRelevance * WEIGHTS.textRelevance +
    breakdown.intakeFit * WEIGHTS.intakeFit +
    breakdown.budgetFit * WEIGHTS.budgetFit +
    breakdown.stockFit * WEIGHTS.stockFit +
    breakdown.sizeFit * WEIGHTS.sizeFit +
    breakdown.outfitCompatibility * WEIGHTS.outfitCompatibility +
    breakdown.matchConfidence * WEIGHTS.matchConfidence;

  const reasons = [text.reason, intake.reason, budget.reason, stock.reason, size.reason, outfit.reason].filter(
    (r): r is string => !!r
  );

  return { product, score, breakdown, reasons };
}
