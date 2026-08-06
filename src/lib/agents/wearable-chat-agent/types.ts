import type { BundleSuggestion, Product, TryOnImageMessage } from "@/modules/shopping-agent/types";
import type { StoreCategory } from "@/modules/store/types";
import type { CatalogMatchType } from "@/lib/catalog/search-catalog";

export type IntakeField = "occasion" | "style" | "budget";
export type IntakeState = Partial<Record<IntakeField, string>>;

/** Body profile fields the agent reasons about and can update, mirroring the fields
 *  already collected in TryOnProfile — the client sends these fresh on every turn since
 *  this agent, like the rest of the app's history, is stateless server-side. */
export interface WearableChatProfileContext {
  heightCm: number | null;
  weightKg: number | null;
  chestCm: number | null;
  waistCm: number | null;
  shoeSizeEu: number | null;
  /** Needed to regenerate the avatar via update_measurements — absent once the shopper has
   *  discarded/never had a source photo (e.g. an account resumed after a refresh). */
  photoBase64: string | null;
  photoMimeType: string | null;
  avatarUrl: string | null;
  /** True when the shopper uploaded their own photo as their avatar instead of generating
   *  one — matches the existing "custom" skip-regeneration behavior. */
  isCustomAvatar: boolean;
}

/** Per-request context assembled by the API route from the authenticated session + the
 *  client's current ephemeral state, and handed to the agent for one chat turn. */
export interface WearableChatContext {
  userId: string;
  openaiApiKey: string;
  creditsRemaining: number;
  profile: WearableChatProfileContext;
  /** The outfit currently being built — lets "try that on" work with no explicit ids. */
  outfitItems: Product[];
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
  /** Each entry is one search_catalog call's ranked results this turn — used by outfit-matching
   *  to decide bundle-vs-alternatives and to build the bundle itself. */
  searchCallsThisTurn: SearchCallResult[];
  intake: IntakeState;
  creditsRemaining: number;
  profilePatch: Partial<Record<"heightCm" | "weightKg" | "chestCm" | "waistCm" | "shoeSizeEu" | "avatarUrl", number | string>>;
}

/** One SSE-delivered event. The route serializes each of these as one `data: {...}` frame. */
export type WearableAgentEvent =
  | { type: "tool"; tool: string; status: "start" | "end" }
  | { type: "text"; delta: string }
  | { type: "products"; products: Product[]; matchType?: CatalogMatchType }
  | { type: "product_recommendations"; productIds: string[]; matchType?: CatalogMatchType }
  | { type: "bundle"; bundle: BundleSuggestion; products: Product[] }
  | ({ type: "try_on" } & TryOnImageMessage)
  | { type: "add_to_cart"; products: Product[] }
  | { type: "intake"; intake: IntakeState }
  | { type: "profile"; patch: Partial<Record<"heightCm" | "weightKg" | "chestCm" | "waistCm" | "shoeSizeEu" | "avatarUrl", number | string>> }
  | { type: "credits"; creditsRemaining: number }
  | { type: "error"; message: string }
  | { type: "done" };
