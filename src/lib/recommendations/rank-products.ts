import type { Product } from "@/modules/commerce/types";
import { scoreProduct } from "./score-product";
import type { RankingContext, ScoredProduct } from "./types";

/** Stable comparator — higher score first, then lexicographic id for deterministic ties. */
function compareScored(a: ScoredProduct, b: ScoredProduct): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.product.id.localeCompare(b.product.id);
}

/**
 * Ranks live catalog candidates for a single search turn. Out-of-stock items are heavily
 * down-ranked via scoring (not hard-filtered) so the model can still mention them if needed,
 * but they sink below in-stock alternatives.
 */
export function rankProducts(candidates: Product[], ctx: RankingContext): ScoredProduct[] {
  return candidates.map((product) => scoreProduct(product, ctx)).sort(compareScored);
}

export function selectTopK(scored: ScoredProduct[], k: number): Product[] {
  return scored.slice(0, Math.max(0, k)).map((s) => s.product);
}

export function rankAndSelectTopK(candidates: Product[], ctx: RankingContext, k: number): Product[] {
  return selectTopK(rankProducts(candidates, ctx), k);
}
