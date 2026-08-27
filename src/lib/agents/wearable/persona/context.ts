import { isAcsConfigured } from "@/lib/catalog/acs/config";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { expandCategorySelection } from "@/lib/catalog/category-scope";
import type { BundleState, CatalogFacets, ConversationTurn } from "@/lib/retrieval/types";
import { rehydrateAnchor, rehydrateProducts } from "./engine";
import { toAnchor } from "./anchor";
import { parseHardRules } from "./hard-rules";
import { toProducts } from "./hydrate";
import type { ChatMessage, Product } from "@/modules/shopping-agent/types";
import type { IntakeState, WearableChatContext, WearableChatProfileContext } from "./types";

/** How much conversation the router, filter builder and statement builder each see. Enough for
 *  "actually, cheaper" to keep the category established earlier, short enough that an old
 *  abandoned thread doesn't drag every later search back towards it. */
const RECENT_TURNS = 8;

export interface RetrievalStateInput {
  anchorId?: string | null;
  /** Set when the shopper picked the anchor by clicking Select on a card, rather than the server
   *  inferring it from their wording. A click is unambiguous in a way "that one" never is, so it
   *  outranks every inferred reference until they dismiss it or name something else outright. */
  anchorPinned?: boolean;
  bundleState?: BundleState | null;
  shownProductIds?: string[];
}

export interface BuildContextInput {
  ownerId: string;
  /** Stable per-shopper id for ACS user events — see `WearableChatContext.visitorId`. */
  visitorId: string;
  geminiApiKey: string;
  creditsRemaining: number;
  profile: WearableChatProfileContext;
  history: ChatMessage[];
  outfitItems: Product[];
  knownProductIds: string[];
  intake: IntakeState;
  retrievalState: RetrievalStateInput;
}

/**
 * Assembles one turn's context.
 *
 * Shared by the dashboard route and the embed route so the two can't drift — they take
 * different auth paths to the same owner, and a retrieval feature wired into only one of them
 * would work in testing and silently not work on a merchant's own site.
 */
export async function buildWearableChatContext(input: BuildContextInput): Promise<WearableChatContext> {
  const connection = await getStoreConnectionByOwner(input.ownerId);
  const activeCategories = connection
    ? connection.categories.filter((category) => connection.selectedCategoryIds.includes(category.id))
    : [];

  // Resolved once per turn and threaded through every retrieval read. The merchant selects parent
  // categories, but products are indexed under whichever descendant they actually sit in, so the
  // unexpanded selection would match almost nothing.
  const categoryScope = connection
    ? expandCategorySelection(connection.selectedCategoryIds, connection.categories)
    : [];

  // Facets are deliberately not loaded here. `getCatalogFacets` browses up to 2,000 products;
  // doing that before routing made a turn which only asks for a missing budget perform a large
  // ACS read anyway. The retrieval engine loads facets lazily, after every intake gate has
  // passed and immediately before a mode actually needs them.
  const emptyFacets: CatalogFacets = { categories: [], brands: [], priceRange: null };

  const discussedIds = input.retrievalState.bundleState?.discussed?.map((item) => item.externalId) ?? [];

  const [anchor, knownCandidates, discussedCandidates] = connection
    ? await Promise.all([
        input.retrievalState.anchorId
          ? rehydrateAnchor(connection.id, input.retrievalState.anchorId, categoryScope)
          : Promise.resolve(null),
        rehydrateProducts(connection.id, input.knownProductIds, categoryScope),
        discussedIds.length > 0 ? rehydrateProducts(connection.id, discussedIds, categoryScope) : Promise.resolve([]),
      ])
    : [null, [], []];

  // Never logs merchant text (title only) or attribute values — just enough to tell "this
  // product genuinely has no recorded description/options" apart from "retrievability or sync
  // silently dropped it before it ever reached here", which look identical to the shopper but
  // need different fixes (see the plan's "Improve diagnostics" step).
  if (anchor) {
    const attributeKeys = Object.keys(anchor.attributes ?? {});
    console.log(
      `[persona anchor] id=${anchor.externalId} productGroup=${anchor.productGroupId ? "yes" : "no"} ` +
        `description=${anchor.enrichedDescription ? "present" : "absent"} attributeKeys=${attributeKeys.length}` +
        (attributeKeys.length > 0 ? ` (${attributeKeys.join(",")})` : "")
    );
  }

  const recentTurns: ConversationTurn[] = input.history
    .filter(
      (message): message is ChatMessage & { role: "user" | "assistant" } =>
        message.role === "user" || message.role === "assistant"
    )
    .slice(-RECENT_TURNS)
    .map((message) => ({ role: message.role, content: message.content }));

  return {
    userId: input.ownerId,
    visitorId: input.visitorId,
    geminiApiKey: input.geminiApiKey,
    creditsRemaining: input.creditsRemaining,
    profile: input.profile,
    outfitItems: input.outfitItems,
    knownProducts: toProducts(knownCandidates),
    intake: input.intake,
    storeProductCount: connection?.productCount ?? 0,
    categories: activeCategories,
    categoryScope,
    connection,
    // ACS being unconfigured (no GCP project/credentials wired up yet) must degrade the same way
    // an unfinished backfill does — straight to the live-store-API fallback in
    // `search-catalog.ts` — rather than reporting "ready" and then failing every search call
    // when `getAcsConfig()` throws deeper in the search-adapter.
    catalogReady: connection?.catalogSyncStatus === "ready" && isAcsConfigured(),
    facets: emptyFacets,
    hardRules: parseHardRules(connection?.hardRules),
    styleGuide: connection?.styleGuide ?? null,
    recentTurns,
    anchor,
    // Only meaningful with an anchor behind it: a pin flag that outlived the product it pointed
    // at (deselected categories, a deleted product) would suppress resolution in favour of null.
    anchorPinned: input.retrievalState.anchorPinned === true && anchor !== null,
    bundleState: input.retrievalState.bundleState ?? null,
    discussedBundleItems: discussedCandidates.map(toAnchor),
    shownProductIds: Array.isArray(input.retrievalState.shownProductIds)
      ? input.retrievalState.shownProductIds
      : [],
  };
}
