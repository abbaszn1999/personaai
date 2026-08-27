import type { Product } from "@/modules/shopping-agent/types";

export const RETRIEVAL_MODES = ["ask_info", "filter", "cosine", "bundle", "attribute_variant"] as const;

export type RetrievalMode = (typeof RETRIEVAL_MODES)[number];

export function isRetrievalMode(value: unknown): value is RetrievalMode {
  return typeof value === "string" && (RETRIEVAL_MODES as readonly string[]).includes(value);
}

export interface RuleSelector {
  brands?: string[];
  categories?: string[];
  subcategories?: string[];
}

/**
 * Client constraints that are absolute, typed so they are executed rather than interpreted.
 *
 * A merchant saying "never" is a constraint compiled into the query, not a preference weighed
 * against other considerations — which is exactly what would happen if these were handed to a
 * model as prose. Soft taste guidance lives in `style_guide` instead.
 */
export type HardRule =
  | { type: "exclude_items"; externalIds?: string[]; brands?: string[]; categories?: string[] }
  | { type: "never_pair"; a: RuleSelector; b: RuleSelector }
  | { type: "max_price_spread"; amount: number };

/** Runs on merchant-supplied columns only. There is deliberately no colour, material or
 *  formality field: those are reached through cosine, because they are exactly the attributes
 *  merchants populate inconsistently or not at all.
 *
 *  `category`/`subcategory` are the merchant's own real names, matched against every selected
 *  category a product belongs to — not a fixed vocabulary. `garmentCategory`/`garmentSubcategory`
 *  are a separate, internal-only pair used by the bundle finder to target a physical slot (top,
 *  bottom, shoe, ...); they are never shown to the shopper and never set from a shopper's words. */
export interface CatalogFilter {
  category?: string;
  subcategory?: string;
  brand?: string;
  priceMin?: number;
  priceMax?: number;
  inStockOnly?: boolean;
  excludeExternalIds?: string[];
  garmentCategory?: string;
  garmentSubcategory?: string;
}

/** One selected category a product belongs to, in the merchant's own names, ordered root-first
 *  down to the product's own most specific tag — `["Men", "Clothing", "Shirts"]` — however many
 *  levels deep the merchant's store actually nests that category. */
export type CategoryPath = string[];

export interface CatalogCandidate {
  externalId: string;
  productGroupId: string | null;
  title: string;
  brand: string | null;
  /** Every selected category this product belongs to — a product can carry more than one, and
   *  each one can be an arbitrarily deep chain. There is no primary scalar column anymore;
   *  callers that need a flattened view (an anchor, a display tag, a 2-level filter match)
   *  derive it from this. */
  categoryPaths: CategoryPath[];
  price: number | null;
  currency: string | null;
  inStock: boolean;
  productUrl: string | null;
  imageUrl: string | null;
  enrichedDescription: string | null;
  /** Every predefined variant bucket ACS recognizes (colour, size, material, ...) *and* every
   *  per-merchant custom option (fit, collar type, inseam, ...) this product actually carries,
   *  keyed by whatever label the mapper gave it on the way in — see `extractVariantAttributes`
   *  in map-product.ts, whose bucket names this mirrors. There is no fixed set of keys: a
   *  product from one store might have none of these, another might have five nothing here
   *  anticipates by name. Absent (or empty) when the product has nothing recorded. */
  attributes?: Record<string, string[]>;
  /** Internal try-on/bundle slot, derived from the title at index time. */
  garmentCategory: string | null;
  garmentSubcategory: string | null;
  similarity?: number;
}

/** Distinct values actually present in one merchant's catalog, injected into every
 *  filter-building call so the model builds against what exists. */
export interface CatalogFacets {
  categories: Array<{ category: string; subcategory: string | null }>;
  brands: string[];
  priceRange: { min: number; max: number } | null;
}

/** The item the conversation is currently "about" — what "it", "that one" and "the second
 *  one" resolve to, and what bundle mode builds around. */
export interface AnchorState {
  externalId: string;
  productGroupId: string | null;
  title: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  enrichedDescription: string | null;
  /** Same bag as `CatalogCandidate.attributes`, carried through so a *pinned* item can answer
   *  anything about itself from context — see `buildSystemPrompt` and `attribute_variant`. */
  attributes?: Record<string, string[]>;
  /** Internal garment slot, carried through so a resolved anchor can be matched against a
   *  discussed bundle's own items (see `DiscussedBundleItem`) without a second lookup. */
  garmentCategory: string | null;
}

/** One item inside a bundle the shopper is actively discussing — enough to answer questions
 *  about it from context and to scope a swap search if they ask to replace it. */
export interface DiscussedBundleItem {
  externalId: string;
  /** Internal garment slot (top/bottom/outerwear/...), not the merchant's own category name —
   *  matches `CatalogCandidate.garmentCategory`, which is what a swap search filters on. */
  category: string;
  price: number;
}

export interface BundleState {
  /** Categories the shopper requested for this outfit. */
  scope: string[];
  /** Category → externalId for items the shopper has approved. Locked items survive
   *  refinement so "change the shoes" doesn't rebuild the whole outfit. */
  locked: Record<string, string>;
  /** Set by "Discuss this bundle" — every item of the outfit the shopper is currently pinned
   *  on, so the model can answer about any of them and a free-text "replace the pants" can be
   *  resolved against this bundle's own contents rather than needing a per-item click. Null when
   *  no bundle is being discussed. */
  discussed?: DiscussedBundleItem[] | null;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

/** Everything one retrieval request needs. Assembled per turn by the tool handler. */
export interface RetrievalContext {
  connectionId: string;
  /** Merchant category ids the agent may retrieve from, already expanded to include descendants.
   *  Passed into every catalog read: the model composes its own filters, so scope has to be
   *  enforced at the query rather than left to whatever the model asked for. */
  categoryScope: string[];
  /** The merchant's key: routing, filter-building, statement-building, query embedding and
   *  the bundle vision call are all per-shopper-turn work. */
  apiKey: string;
  query: string;
  recentTurns: ConversationTurn[];
  anchor: AnchorState | null;
  /** Already shown this conversation, so "different options" genuinely differs. */
  shownExternalIds: string[];
  hardRules: HardRule[];
  styleGuide: string | null;
  facets: CatalogFacets;
  bundle: BundleState | null;
  /** Derived from the shopper's stated budget when the model doesn't name a ceiling. */
  budgetMax?: number;
  /** The least the shopper will pay, when they named a floor ("at least $200"). Separate from
   *  `budgetMax` and never derived from it: one number stated once is one bound, and treating a
   *  floor as a ceiling filters to an exact price nothing has. */
  budgetMin?: number;
  /** Hint from the tool call when the shopper named a category explicitly. */
  categoryHint?: string;
  /** Stable per-shopper id (see `WearableChatContext.visitorId`), passed straight through to
   *  ACS's `visitorId` on every search call — required for personalization and for the
   *  `attributionToken` returned alongside results to attribute correctly. */
  visitorId: string;
}

/** One item within a proposed outfit, carrying the category it filled — known for free since
 *  each candidate was retrieved by filtering on that exact `garmentCategory`. */
export interface BundleOptionItem {
  externalId: string;
  category: string | null;
  price: number | null;
}

/** A bundle option as returned to the shopper: one item per category plus the reasoning.
 *  `externalIds` is kept alongside `items` for callers that only need identity. */
export interface BundleOption {
  externalIds: string[];
  items: BundleOptionItem[];
  rationale: string;
}

export interface RetrievalResult {
  mode: RetrievalMode;
  products: Product[];
  /** ask_info only: exactly one question, never a checklist. */
  question?: string;
  quickOptions?: string[];
  bundles?: BundleOption[];
  /** Short note for the model's own summary — e.g. that constraints were relaxed. */
  note?: string;
  /** Set when the request was answered from the live store API because the local index isn't
   *  ready yet. */
  fallback?: boolean;
  anchor?: AnchorState | null;
  bundleState?: BundleState | null;
  /** Carried from `ModeOutcome.attributionToken` — the `search_catalog` tool passes this
   *  straight into `recordSearchEvent` and stashes it on the runtime for the turn's later
   *  try-on/add-to-cart events to attribute back to this search. */
  attributionToken?: string;
}
