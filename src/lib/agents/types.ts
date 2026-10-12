import type {
  BundleSuggestion,
  BundleSuggestionSlot,
  Product,
  TurnAttribution,
} from "@/modules/commerce/types";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import type { StoredPathConfig } from "@/lib/catalog/path-config/types";
import type { CatalogCandidate, ConversationTurn } from "@/lib/retrieval/types";
import type { UsageSurface } from "@/lib/billing/pricing";
import type { SessionMeter } from "@/lib/billing/session-meter";
import type { ShopperMeasurements } from "./shared/fit";

export type AgentName = "persona" | "bundle" | "attribute";

/** `{ key: "fit", values: ["slim"] }` — how every agent names an attribute constraint. Keys and
 *  values come from the path config; code maps them to ACS fields. */
export interface AttributeConstraint {
  key: string;
  values: string[];
}

/** The last catalog search Persona ran, carried by the client so a refinement ("cheaper",
 *  "in black") inherits everything the shopper did not change. */
export interface LastSearch {
  action: "filter" | "cosine";
  path: string;
  /** Further leaves searched together with `path` ("shirts or polos"). */
  alsoPaths?: string[];
  brands: string[];
  priceMin: number | null;
  priceMax: number | null;
  attributes: AttributeConstraint[];
  sizes: string[];
  query: string;
  excludeBrands?: string[];
  excludeAttributes?: AttributeConstraint[];
}

/** One slot of a look as Bundle searched it — kept on the look so a follow-up can swap one slot
 *  without re-deriving the others. */
export type LookSlot = BundleSuggestionSlot;

/** A composed look. Extends the chat UI's bundle shape with what Bundle needs back on a
 *  follow-up turn. */
export interface LookRecord extends BundleSuggestion {
  anchorId: string;
  total: number;
  budget: number | null;
  department: string;
  slots: LookSlot[];
  /** What the shopper had asked of the looks when this one was built, in their words. */
  brief?: string;
  /** The look's colour story ("navy, white, tan accent") — a swap keeps to it. */
  palette?: string;
  /** How the stylist read the anchor when the look was built. */
  anchorRead?: string;
}

export type AgentAttachment =
  /** "Ask about this item" — the Attribute agent answers every typed message. */
  | { kind: "item"; productId: string }
  /** "Complete the look" — the product the looks are built around; the Bundle agent answers.
   *  `brief` (everything the shopper has asked of the looks so far) and `shownIds` (pieces
   *  already shown around it) are Bundle's memory of this anchor: the server writes them in an
   *  `attachment` event and the widget sends them back with every turn. */
  | { kind: "anchor"; productId: string; brief?: string; shownIds?: string[] }
  /** "Ask about this bundle" — the Bundle agent answers about this look. */
  | { kind: "look"; look: LookRecord };

export interface ShopperSession {
  /** The profile's audience as the shopper chose it (`woman`, `man`, `kids-girl`, …). */
  audience: string | null;
  /** Persona department inferred from the shopper's profile audience; null when unknown. */
  department: string | null;
  /** The optional budget for a full look: the widget's field, kept from the budget the shopper
   *  last named while a look's anchor was attached (null on a fresh "Complete the look"). */
  budget: number | null;
  /** Onboarding measurements. When present, every search returns only products whose chart
   *  confirms an in-stock size fits them. */
  measurements: ShopperMeasurements | null;
}

export function isLookRecord(bundle: BundleSuggestion): bundle is LookRecord {
  return typeof bundle.anchorId === "string" && typeof bundle.total === "number" && Array.isArray(bundle.slots);
}

export type AgentStage = "thinking" | "searching" | "composing";

/** One SSE frame. The routes serialize each as `data: {...}`. */
export type AgentEvent =
  | { type: "agent"; agent: AgentName }
  | { type: "status"; stage: AgentStage; detail?: string }
  | { type: "text"; delta: string }
  | { type: "products"; products: Product[] }
  | { type: "product_recommendations"; productIds: string[]; note?: string }
  | { type: "bundle"; bundles: LookRecord[]; products: Product[] }
  /** Server-side attachment change: a follow-up updated the attached look, Bundle updated its
   *  memory of the attached anchor, or the attached product no longer exists in the store. Only
   *  the shopper's × ends a mode otherwise. */
  | { type: "attachment"; attachment: AgentAttachment | null }
  | { type: "quick_options"; options: string[] }
  /** The budget the shopper just named while a look's anchor is attached; the widget keeps it for later turns. */
  | { type: "budget"; budget: number | null }
  | { type: "retrieval_state"; shownProductIds: string[]; lastSearch: LastSearch | null }
  /** Sent once, just before `done`: what produced this turn, for conversion logging. */
  | { type: "attribution"; attribution: TurnAttribution }
  | { type: "error"; message: string }
  | { type: "done" };

/** Everything one turn needs, assembled once by the route. */
export interface AgentContext {
  userId: string;
  visitorId: string;
  usageSource?: UsageSurface;
  geminiApiKey: string;
  meter?: SessionMeter;
  connection: StoreConnectionRow | null;
  catalogReady: boolean;
  categoryScope: string[];
  pathConfig: StoredPathConfig | null;
  session: ShopperSession;
  /** Recent turns before the current message, oldest first. */
  history: ConversationTurn[];
  message: string;
  /** Products the client referenced this turn (on screen, attached, the anchor), rehydrated
   *  from ACS by id. */
  products: Map<string, CatalogCandidate>;
  /** Most recent first-shown order — ordinals ("the second one") resolve against this. */
  shownProductIds: string[];
  lastSearch: LastSearch | null;
  attachment: AgentAttachment | null;
  /** A product the client says this message is about (e.g. a tapped card). When it resolves,
   *  it wins over resolving the reference from the message text. */
  referencedItemId: string | null;
  styleGuide: string | null;
  /** Aborts when the shopper's connection closes, so no model call or search keeps running for
   *  a reply nobody will read. */
  signal?: AbortSignal;
}
