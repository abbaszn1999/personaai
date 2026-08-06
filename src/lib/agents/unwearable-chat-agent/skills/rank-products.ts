import type { Product } from "@/modules/shopping-agent/types";
import type { CatalogMatchType } from "@/lib/catalog/search-catalog";
import { extractKeywords } from "@/lib/catalog/query-helpers";
import { parseBudgetMax } from "@/lib/recommendations";
import type { IntakeState } from "../types";

/**
 * Deterministic ranking for unwearable products — the fallback used whenever the AI pick in
 * select-products.ts fails. Mirrors the wearable scorer's shape (weights + per-signal scoring)
 * but drops the two signals that need a body profile / outfit (sizeFit, outfitCompatibility),
 * which don't exist in this mode.
 */
export interface RankingContext {
  intake: IntakeState;
  query: string;
  matchType: CatalogMatchType;
}

export interface ScoredProduct {
  product: Product;
  score: number;
}

const WEIGHTS = {
  textRelevance: 34,
  intakeFit: 22,
  budgetFit: 20,
  stockFit: 18,
  matchConfidence: 6,
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

function scoreTextRelevance(product: Product, query: string): number {
  const needles = tokenize(query);
  if (needles.length === 0) return 0.35;
  const score = overlapScore(productTokens(product), needles);
  return score > 0 ? score : 0.1;
}

function scoreIntakeFit(product: Product, ctx: RankingContext): number {
  const needles = tokenize(ctx.intake.useCase, ctx.intake.priority);
  if (needles.length === 0) return 0.4;
  const score = overlapScore(productTokens(product), needles);
  return score > 0 ? Math.max(0.35, score) : 0.2;
}

function scoreBudgetFit(product: Product, ctx: RankingContext): number {
  const max = parseBudgetMax(ctx.intake.budget);
  if (max === null) return 0.6;
  if (product.price <= 0) return 0.3;
  if (product.price <= max * 0.7) return 1;
  if (product.price <= max) return 0.85;
  if (product.price <= max * 1.15) return 0.35;
  return 0.05;
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

export function scoreProduct(product: Product, ctx: RankingContext): ScoredProduct {
  const score =
    scoreTextRelevance(product, ctx.query) * WEIGHTS.textRelevance +
    scoreIntakeFit(product, ctx) * WEIGHTS.intakeFit +
    scoreBudgetFit(product, ctx) * WEIGHTS.budgetFit +
    (product.inStock ? 1 : 0) * WEIGHTS.stockFit +
    scoreMatchConfidence(ctx) * WEIGHTS.matchConfidence;

  return { product, score };
}

/** Stable comparator — higher score first, then lexicographic id for deterministic ties. */
function compareScored(a: ScoredProduct, b: ScoredProduct): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.product.id.localeCompare(b.product.id);
}

/** Out-of-stock items are heavily down-ranked via scoring (not hard-filtered) so the model
 *  can still mention them if needed, but they sink below in-stock alternatives. */
export function rankProducts(candidates: Product[], ctx: RankingContext): ScoredProduct[] {
  return candidates.map((product) => scoreProduct(product, ctx)).sort(compareScored);
}

export function rankAndSelectTopK(candidates: Product[], ctx: RankingContext, k: number): Product[] {
  return rankProducts(candidates, ctx)
    .slice(0, Math.max(0, k))
    .map((s) => s.product);
}
