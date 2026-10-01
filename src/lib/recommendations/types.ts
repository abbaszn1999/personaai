import type { Product } from "@/modules/commerce/types";
import type { CatalogMatchType } from "@/lib/catalog/search-catalog";
import type { StoreCategory } from "@/modules/store/types";

export type IntakeField = "occasion" | "style" | "budget";
export type IntakeState = Partial<Record<IntakeField, string>>;

/** The shopper's body measurements, as the size recommender reads them. */
export interface WearableChatProfileContext {
  heightCm: number | null;
  weightKg: number | null;
  chestCm: number | null;
  waistCm: number | null;
  shoeSizeEu: number | null;
  photoBase64: string | null;
  photoMimeType: string | null;
  avatarUrl: string | null;
  isCustomAvatar: boolean;
}

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
