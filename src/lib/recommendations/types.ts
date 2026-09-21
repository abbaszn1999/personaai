import type { Product } from "@/modules/commerce/types";
import type { CatalogMatchType } from "@/lib/catalog/search-catalog";
import type { IntakeState, WearableChatProfileContext } from "@/lib/agents/wearable/persona/types";
import type { StoreCategory } from "@/modules/store/types";

export interface RankingContext {
  profile: WearableChatProfileContext;
  intake: IntakeState;
  query: string;
  matchType: CatalogMatchType;
  categories: StoreCategory[];
  outfitItems?: Product[];
}

export interface ScoreBreakdown {
  textRelevance: number;
  intakeFit: number;
  budgetFit: number;
  stockFit: number;
  sizeFit: number;
  outfitCompatibility: number;
  matchConfidence: number;
}

export interface ScoredProduct {
  product: Product;
  score: number;
  breakdown: ScoreBreakdown;
  reasons: string[];
}
