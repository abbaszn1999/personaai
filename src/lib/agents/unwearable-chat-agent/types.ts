import type { BundleSuggestion, Product } from "@/modules/shopping-agent/types";
import type { StoreCategory } from "@/modules/store/types";
import type { CatalogMatchType } from "@/lib/catalog/search-catalog";

export type IntakeField = "useCase" | "budget" | "priority";
export type IntakeState = Partial<Record<IntakeField, string>>;

/** Per-request context assembled by the API route from the authenticated session (or embed
 *  token resolution) + the client's current ephemeral state, handed to the agent for one
 *  chat turn. Mirrors WearableChatContext minus everything body/avatar/try-on specific. */
export interface UnwearableChatContext {
  userId: string;
  geminiApiKey: string;
  /** The client's accumulated live-product cache from earlier turns, so the model can
   *  reference products found in previous searches without re-searching. */
  knownProducts: Product[];
  intake: IntakeState;
  storeProductCount: number;
  /** The merchant's synced categories, so the system prompt can hint at real category ids. */
  categories: StoreCategory[];
}

export interface SearchCallResult {
  products: Product[];
  matchType: CatalogMatchType;
  query: string;
}

/** Mutable state threaded through one turn's tool calls. */
export interface ToolRuntimeState {
  knownProducts: Map<string, Product>;
  /** Each entry is one search_catalog call's ranked results this turn — used by solution-kit
   *  to decide kit-vs-alternatives and to build the kit itself. */
  searchCallsThisTurn: SearchCallResult[];
  intake: IntakeState;
}

/** One SSE-delivered event. The route serializes each of these as one `data: {...}` frame. */
export type UnwearableAgentEvent =
  | { type: "tool"; tool: string; status: "start" | "end" }
  | { type: "text"; delta: string }
  | { type: "products"; products: Product[]; matchType?: CatalogMatchType }
  | { type: "product_recommendations"; productIds: string[]; matchType?: CatalogMatchType }
  | { type: "bundle"; bundle: BundleSuggestion; products: Product[] }
  | { type: "add_to_cart"; products: Product[] }
  | { type: "intake"; intake: IntakeState }
  | { type: "error"; message: string }
  | { type: "done" };
