import type { BundleSuggestion, Product, TryOnImageMessage } from "@/modules/commerce/types";
import type { StoreCategory } from "@/modules/store/types";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import type {
  AnchorState,
  BundleOption,
  BundleState,
  CatalogFacets,
  ConversationTurn,
  HardRule,
  RetrievalMode,
} from "@/lib/retrieval/types";
import type { SessionMeter } from "@/lib/billing/session-meter";
import type { WearableChatProfileContext } from "../types";

export type IntakeField = "occasion" | "style" | "budget";
export type IntakeState = Partial<Record<IntakeField, string>>;

/** Defined one level up because fit-analysis needs it too, and re-exported here so the
 *  existing `persona/types` import surface is unchanged. */
export type { WearableChatProfileContext };

/** Per-request context assembled by the API route from the authenticated session + the
 *  client's current ephemeral state, and handed to the agent for one chat turn. */
export interface WearableChatContext {
  userId: string;
  geminiApiKey: string;
  creditsRemaining: number;
  profile: WearableChatProfileContext;
  /** The outfit currently being built — lets "try that on" work with no explicit ids. */
  outfitItems: Product[];
  /** Products from earlier turns, rehydrated server-side from `catalog_products` off the ids
   *  the client sends back. Full product objects no longer make the round trip: on a synced
   *  catalog the server is the source of truth, and echoing them back grows the request body
   *  turn after turn for data we already hold. */
  knownProducts: Product[];
  intake: IntakeState;
  storeProductCount: number;
  /** The merchant's synced categories, so the system prompt can hint at real category ids. */
  categories: StoreCategory[];
  /** Every merchant category id the agent may retrieve from — the selection expanded to include
   *  descendants. Enforced on each read rather than trusted to the caller, because the model
   *  builds its own filters and must not be able to widen what it can reach. */
  categoryScope: string[];

  // ─── Retrieval state ────────────────────────────────────────────────────────
  /** Null when no store is connected, in which case retrieval can't run at all. */
  connection: StoreConnectionRow | null;
  /** Whether the local index is usable yet. False during the initial backfill. */
  catalogReady: boolean;
  /** Distinct values present in this catalog, injected into every filter-building call. */
  facets: CatalogFacets;
  hardRules: HardRule[];
  styleGuide: string | null;
  /** Recent turns, so the router, filter builder and statement builder all read the
   *  conversation rather than the latest message in isolation. */
  recentTurns: ConversationTurn[];
  /** Which product the conversation is currently about. */
  anchor: AnchorState | null;
  /** Whether that anchor came from a click rather than from the shopper's wording — see
   *  `RetrievalStateInput.anchorPinned`. */
  anchorPinned: boolean;
  /** In-progress bundle, carried across turns by the client. */
  bundleState: BundleState | null;
  /** Rehydrated `bundleState.discussed` entries, in the same shape a single anchor uses, so
   *  the system prompt can render one context block per item — see `prompt.ts`. Empty when
   *  nothing is currently discussed as a bundle. */
  discussedBundleItems: AnchorState[];
  /** Already shown this conversation, so "different options" genuinely differs. */
  shownProductIds: string[];
  /** Stable per-shopper id for ACS user events — the embed session id for the real widget, the
   *  merchant's own account id for the dashboard's authenticated preview. Namespaced per
   *  connection before being sent to ACS (see `buildAcsVisitorId`), not here, so this stays the
   *  same raw value the rest of the app already keys the avatar cache and chat-event log by. */
  visitorId: string;
  /** Accumulates this turn's Gemini tokens and ACS searches. Absent in tests and any caller
   *  that is not a shopper session. */
  meter?: SessionMeter;
}

export interface SearchCallResult {
  products: Product[];
  mode: RetrievalMode;
  query: string;
  note?: string;
}

/** Mutable state threaded through one turn's tool calls. */
export interface ToolRuntimeState {
  knownProducts: Map<string, Product>;
  /** Each entry is one search_catalog call's results this turn. */
  searchCallsThisTurn: SearchCallResult[];
  intake: IntakeState;
  creditsRemaining: number;
  profilePatch: Partial<Record<"heightCm" | "weightKg" | "chestCm" | "waistCm" | "shoeSizeEu" | "avatarUrl", number | string>>;

  // ─── Retrieval state, updated as the turn's searches resolve ────────────────
  anchor: AnchorState | null;
  bundleState: BundleState | null;
  shownProductIds: string[];
  /** Bundles the engine assembled this turn, ready to render as Complete Look cards. */
  bundlesThisTurn: BundleOption[];
  /** A clarifying question the engine returned instead of products. */
  pendingQuestion: { question: string; quickOptions: string[] } | null;
  /** The most recent search's ACS attribution token, if any (see `RetrievalResult.attributionToken`)
   *  — read by try_on/add_to_cart so their user events attribute back to the search that surfaced
   *  the product, per ACS's own guidance. Undefined until the cutover phase wires ACS into the
   *  live router; every event still records fine without it. */
  lastAttributionToken: string | undefined;
  /** Caches one search_catalog response per (anchor, normalized query) pair for this turn only
   *  — see `search-catalog.ts`'s dedupe guard. A model that re-issues essentially the same
   *  current-item lookup mid-turn (retrying a question its first answer didn't satisfy) must get
   *  back the same grounded answer, not a second live search with a growing exclusion list that
   *  drifts further from the item actually being asked about. */
  searchResultCacheThisTurn: Map<string, { resultForModel: string; events: WearableAgentEvent[] }>;
}

/** One SSE-delivered event. The route serializes each of these as one `data: {...}` frame. */
export type WearableAgentEvent =
  | {
      type: "tool";
      tool: string;
      status: "start" | "end";
      /** A truthful user-facing activity. `search_catalog` is also the intake orchestrator, so
       *  its name alone must never be treated as proof that product retrieval is running. */
      activity?: "bundle";
    }
  | { type: "text"; delta: string }
  | { type: "products"; products: Product[]; note?: string }
  | { type: "product_recommendations"; productIds: string[]; note?: string }
  /** Every stylist-validated outfit this turn, not just the strongest one — the carousel on the
   *  client lets the shopper flip through all of them rather than seeing a single pick. */
  | { type: "bundle"; bundles: BundleSuggestion[]; products: Product[] }
  | { type: "quick_options"; options: string[] }
  | ({ type: "try_on" } & TryOnImageMessage)
  | { type: "add_to_cart"; products: Product[] }
  | { type: "intake"; intake: IntakeState }
  /** Retrieval state the client stores and sends back next turn, replacing server sessions. */
  | { type: "retrieval_state"; anchorId: string | null; bundleState: BundleState | null; shownProductIds: string[] }
  | { type: "profile"; patch: Partial<Record<"heightCm" | "weightKg" | "chestCm" | "waistCm" | "shoeSizeEu" | "avatarUrl", number | string>> }
  | { type: "credits"; creditsRemaining: number }
  | { type: "error"; message: string }
  | { type: "done" };
