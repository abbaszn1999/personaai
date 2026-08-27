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
  /** Same-origin, signed, cached preview. Commerce/try-on actions continue using `imageUrl`,
   *  while UI cards use this URL so a slow merchant origin does not break the chat preview. */
  previewImageUrl?: string;
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
  /** Whatever this store's catalog records about the product beyond name/price/description —
   *  colour, size, material, or any store-specific option (fit, collar type, ...), keyed by
   *  whatever label the mapper gave it. See `CatalogCandidate.attributes`. Descriptive only:
   *  unlike `variants`, these carry no id and are never used for add-to-cart selection. */
  attributes?: Record<string, string[]>;
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

/** One item within a suggested bundle, with the category and price shown per-row. */
export interface BundleSuggestionItem {
  productId: string;
  /** Internal garment category (tops/bottoms/outerwear/...), null when unclassified. */
  category: string | null;
  price: number;
}

/** A curated multi-item look the agent can suggest as a single "complete the outfit" unit.
 *  `productIds` is kept for existing onRenderBundle/onAddBundleToCart callers; `items` carries
 *  the richer per-row shape the bundle card and "discuss this bundle" action need. */
export interface BundleSuggestion {
  id: string;
  label: string;
  productIds: string[];
  items: BundleSuggestionItem[];
  rationale?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  productRecommendations?: string[];
  /** How closely productRecommendations matched the shopper's request (exact/partial/broad).
   *  Used by the unwearable agent, which still searches the live store directly. */
  catalogMatchType?: "exact" | "partial" | "broad" | "none";
  /** A specific note from the wearable agent's retrieval engine about how these results were
   *  reached — what it had to relax, or that the catalog is still indexing. Replaces the coarse
   *  exact/partial/broad buckets with something the shopper can actually act on. */
  retrievalNote?: string;
  tryOnImage?: TryOnImageMessage;
  /** Chip-style quick-answer options rendered under this specific message (e.g. intake Q&A). */
  quickOptions?: string[];
  /** Complete outfit bundles suggested alongside this message. */
  bundles?: BundleSuggestion[];
}
