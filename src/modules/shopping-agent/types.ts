import type { WorkspaceMode } from "@/modules/workspaces/types";
import type { GarmentCategory } from "@/modules/wearable-agent/utils/fit-metrics";

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  productCount: number;
  mode: WorkspaceMode;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  categoryId: string;
  tags: string[];
  variants: ProductVariant[];
  rating: number;
  reviewCount: number;
  inStock: boolean;
  /** AI-classified garment slot (outerwear/top/bottom/shoes/dress/other), set once by
   *  classifyGarmentSlots() the first time this product is seen. Undefined until then —
   *  resolveGarmentSlot() falls back to keyword matching on `name` in that case. Travels
   *  with the product through SSE events and client state so it's classified only once. */
  garmentSlot?: GarmentCategory;
}

export interface ProductVariant {
  id: string;
  label: string;
  value: string;
  type: "size" | "color" | "style";
  inStock: boolean;
}

// ─── Chat / agent message types (shared by shopping + wearable agents) ────────

export type ChatRole = "user" | "assistant" | "system";

export interface TryOnImageMessage {
  imageUrl: string;
  items: Array<{ productId: string; name: string; selectedVariant?: string }>;
  recommendedSizes: Record<string, string>;
  fitNotes: string;
}

/** A curated multi-item look the agent can suggest as a single "complete the outfit" unit. */
export interface BundleSuggestion {
  id: string;
  label: string;
  productIds: string[];
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  productRecommendations?: string[];
  /** How closely productRecommendations matched the shopper's request (exact/partial/broad). */
  catalogMatchType?: "exact" | "partial" | "broad" | "none";
  tryOnImage?: TryOnImageMessage;
  /** Chip-style quick-answer options rendered under this specific message (e.g. intake Q&A). */
  quickOptions?: string[];
  /** Complete outfit bundles suggested alongside this message. */
  bundles?: BundleSuggestion[];
}
