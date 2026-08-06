export { parseBudgetMax } from "./parse-budget";
export {
  recommendSizeForProduct,
  recommendSizesForProducts,
  hasRecommendedSizeInStock,
  variantMatchesSize,
  buildFitNote,
} from "./size-for-product";
export { scoreProduct } from "./score-product";
export { rankProducts, selectTopK, rankAndSelectTopK } from "./rank-products";
export { selectBundleItems, buildBundleSuggestion } from "./select-bundle";
export { mergeGarmentIntoOutfit } from "./merge-outfit";
export type { RankingContext, ScoredProduct, ScoreBreakdown } from "./types";
