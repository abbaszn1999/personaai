import type { GarmentCategory } from "@/modules/wearable-agent/utils/fit-metrics";

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  productCount: number;
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
  /** The product's Persona leaf id (`polo-shirt`, `jean`), or the canonical subcategory when its
   *  category was mapped without a leaf. Used only to name the garment in the try-on prompt. */
  garmentLeaf?: string;
  /** Whatever this store's catalog records about the product beyond name/price/description —
   *  colour, size, material, or any store-specific option (fit, collar type, ...), keyed by
   *  whatever label the mapper gave it. See `CatalogCandidate.attributes`. Descriptive only:
   *  unlike `variants`, these carry no id and are never used for add-to-cart selection. */
  attributes?: Record<string, string[]>;
  /** In-stock sizes the store's size chart says fit this shopper, best first. */
  fitSizes?: string[];
  /** The colours the shopper asked for on the turn that showed this product, as the store spells
   *  them. Add to cart keeps to them when the product comes in several colours. */
  preferredColors?: string[];
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

export type FitDirection = "inside" | "size_up" | "size_down";

export interface FitMeasurementAnalysis {
  measurement: string;
  label: string;
  unit: "cm" | "kg";
  shopperValue: number | null;
  min: number | null;
  max: number | null;
  outside: number | null;
  direction: FitDirection | null;
  score: number | null;
}

export interface ItemFitAnalysis {
  productId: string;
  productName: string;
  size: string;
  group: string | null;
  score: number | null;
  label: string;
  metrics: FitMeasurementAnalysis[];
  reason?: "no_chart" | "size_not_found" | "no_measurements";
}

export interface LookFitAnalysis {
  score: number | null;
  label: string;
  items: ItemFitAnalysis[];
}

/** One item within a suggested bundle, with the category and price shown per-row. */
export interface BundleSuggestionItem {
  productId: string;
  /** Internal garment category (tops/bottoms/outerwear/...), null when unclassified. */
  category: string | null;
  price: number;
}

/** One slot of a look as the outfit builder searched it. */
export interface BundleSuggestionSlot {
  slot: string;
  path: string;
  priceMax: number | null;
  query: string;
  attributes: Array<{ key: string; values: string[] }>;
}

/** A curated multi-item look the agent can suggest as a single "complete the outfit" unit.
 *  `productIds` is kept for existing onRenderBundle/onAddBundleToCart callers; `items` carries
 *  the richer per-row shape the bundle card and "Ask about this bundle" need. The optional
 *  fields are set on looks built by the outfit agent, which needs them back on a follow-up. */
export interface BundleSuggestion {
  id: string;
  label: string;
  productIds: string[];
  items: BundleSuggestionItem[];
  rationale?: string;
  anchorId?: string;
  total?: number;
  budget?: number | null;
  department?: string;
  slots?: BundleSuggestionSlot[];
}

/** The budget card under a "Complete the look" reply: rebuilds the looks around the same anchor
 *  for the amount the shopper picks. */
export interface ChatBudgetPrompt {
  anchorId: string;
  /** The budget the looks were built for, or null when none was set. */
  budget: number | null;
  suggestions: number[];
}

/** What produced an assistant turn — carried onto add-to-cart events so a cart add can be
 *  traced to the agent, action, search and look that surfaced the product. */
export interface TurnAttribution {
  agent: "persona" | "bundle" | "attribute";
  /** `filter`, `cosine`, `answer`, `complete_look`, `look_follow_up`, `attribute_answer`. */
  action: string;
  path: string | null;
  query: string | null;
  lookIds: string[];
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
  /** Shown only while this is the latest message — the shopper's next message dismisses it. */
  budgetPrompt?: ChatBudgetPrompt;
  attribution?: TurnAttribution;
}
