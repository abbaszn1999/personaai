import type { ToolDefinition } from "@/lib/ai/gemini-chat";
import { searchCatalog, CatalogSearchError } from "@/lib/catalog/search-catalog";
import { recordSearchEvent } from "@/lib/catalog/acs/user-events";
import { parseBudgetMax } from "@/lib/recommendations";
import type { CatalogCandidate, RetrievalContext } from "@/lib/retrieval/types";
import type { Product } from "@/modules/commerce/types";
import { resolveAnchor, toAnchor } from "../anchor";
import { runRetrieval } from "../engine";
import type { ToolRuntimeState, WearableAgentEvent, WearableChatContext } from "../types";

/** Most results ever shown for one search call — keeps the carousel usable and the model's
 *  summary bounded regardless of how many rows matched. */
const MAX_UI_RESULTS = 10;

/**
 * Applies that cap without cutting into products a bundle card is assembled from.
 *
 * The cap is sized for a flat carousel of individual recommendations, where the eleventh result
 * is genuinely surplus. A bundle turn is not that shape: it needs one product per category per
 * outfit, so five three-piece outfits is fifteen products that are each load-bearing. Truncating
 * any of them doesn't shorten the display — `buildAttachmentPlan` drops a bundle whose members
 * don't all resolve (correctly, since a partial outfit looks like the agent forgot an item), so
 * a single truncated product deletes an entire outfit, and truncating a whole category deletes
 * every outfit at once. That turned a five-outfit turn into four loose t-shirts, which read as
 * the agent ignoring the bundle request rather than as a display cap doing its job.
 *
 * Bundle members are therefore kept in full and the cap governs only what's left over.
 */
function capForUi(products: Product[], bundleMemberIds: Set<string>): Product[] {
  if (bundleMemberIds.size === 0) return products.slice(0, MAX_UI_RESULTS);

  const members = products.filter((product) => bundleMemberIds.has(product.id));
  const surplus = products.filter((product) => !bundleMemberIds.has(product.id));
  return [...members, ...surplus.slice(0, Math.max(0, MAX_UI_RESULTS - members.length))];
}

export const searchCatalogTool: ToolDefinition = {
  type: "function",
  name: "search_catalog",
  description:
    "Searches the merchant's catalog for real products you haven't already seen this conversation. Always call this before describing or recommending a product not already covered by a prior tool result or by the 'Everything known about the item currently being discussed' context — never invent names, prices, or availability. " +
    "Do NOT call this for a fact about the item currently being discussed (its size, material, fit, or anything else already covered in that context block) — a catalog search for one attribute of an already-identified item can return a different, unrelated product, not new facts about this one. If that context doesn't have what was asked, say so directly instead of searching for it. " +
    "Pass the shopper's request in `query` AS THEY PHRASED IT, in full. Do not shorten it to keywords, do not strip words like 'comfortable' or 'for a beach wedding', and do not rewrite it into search terms. " +
    "The search is semantic: it understands intent and matches on meaning, so 'something my dad would wear to a backyard BBQ' finds relaxed warm-weather pieces even though none of those words appear in any product title. Shortening that to 'bbq' would find nothing. " +
    "The search decides on its own whether the request needs filtering, semantic ranking, a coordinated set, or a variant lookup — you do not need to tell it which. " +
    "If it returns a `question`, ask the shopper exactly that and stop; it needs an answer before it can search. " +
    "If it returns a `note`, work that into your reply honestly rather than presenting a widened result as an exact match.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The shopper's request in full, in their own words. Never abbreviated to keywords.",
      },
      maxPrice: {
        type: "number",
        description: "The most the shopper will pay, only if they named a ceiling — 'under $200', 'up to $200'. Never set this from a stated minimum.",
      },
      minPrice: {
        type: "number",
        description: "The least the shopper will pay, only if they named a floor — 'at least $200', 'minimum $200', 'nothing under $200'.",
      },
    },
    required: ["query"],
  },
};

/**
 * Strips a rendered product down to what the model gets back per result. `description` and
 * `attributes` ride along so a *freshly shown* (not yet pinned) product can be discussed the
 * same turn without a second tool call — see `tool-policy.md`. Both are omitted when empty
 * rather than sent as `""`/`{}`, since an absent field reads unambiguously as "nothing known"
 * whereas an empty one could be mistaken for "known to be blank".
 */
function summarise(
  products: Array<{
    id: string;
    name: string;
    price: number;
    currency: string;
    inStock: boolean;
    description?: string;
    attributes?: Record<string, string[]>;
  }>
) {
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price,
    currency: product.currency,
    inStock: product.inStock,
    ...(product.description ? { description: product.description } : {}),
    ...(product.attributes && Object.keys(product.attributes).length > 0 ? { attributes: product.attributes } : {}),
  }));
}

/** Collapses whitespace/case so trivial rewordings of the same request still hit the cache —
 *  not full normalization, just enough to catch a model re-issuing what is functionally the
 *  same call. */
function normaliseQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function handleSearchCatalog(
  args: Record<string, unknown>,
  context: WearableChatContext,
  runtime: ToolRuntimeState
): Promise<{ resultForModel: string; events: WearableAgentEvent[] }> {
  const query = typeof args.query === "string" ? args.query : "";
  const explicitMaxPrice = typeof args.maxPrice === "number" ? args.maxPrice : undefined;
  const budgetMin = typeof args.minPrice === "number" && args.minPrice > 0 ? args.minPrice : undefined;
  const budgetMax = explicitMaxPrice ?? parseBudgetMax(runtime.intake.budget ?? context.intake.budget) ?? undefined;

  // The arguments as the model actually filled them in. A price bound that arrives in the wrong
  // slot is invisible in the executed filter, which looks equally deliberate either way.
  console.log(
    `[persona search_catalog] minPrice=${budgetMin ?? "-"} maxPrice=${explicitMaxPrice ?? "-"} ` +
      `intakeBudgetMax=${explicitMaxPrice === undefined ? budgetMax ?? "-" : "-"} query=${JSON.stringify(query.slice(0, 120))}`
  );

  if (!context.connection) {
    return {
      resultForModel: JSON.stringify({ error: "No store is connected to this account yet." }),
      events: [],
    };
  }

  // While the initial backfill is still running there is nothing to rank against, so retrieval
  // degrades to the live store API rather than answering from a fraction of the catalog.
  if (!context.catalogReady) {
    return liveSearchFallback(query, budgetMax, context, runtime);
  }

  // Resolved before routing, because the router itself reads the anchor to tell a variant
  // question from a fresh search.
  const lastShown = runtime.searchCallsThisTurn.at(-1)?.products ?? [];
  const current = runtime.anchor ?? context.anchor;
  const anchor =
    resolveAnchor({
      message: query,
      lastShown: lastShown.map(toCandidateShape),
      current,
      // The pin covers the product the shopper clicked. An earlier search this same turn may
      // already have moved off it by name, and the pin does not follow — it protects one item
      // from inference, not the anchor slot in general.
      pinned: context.anchorPinned && current?.externalId === context.anchor?.externalId,
    }) ?? current;

  // A model re-asking essentially the same thing about the same item mid-turn must get the same
  // grounded answer back, not a second live search that grows the exclusion list and drifts
  // toward unrelated products — the exact failure mode this cache exists to close off.
  const cacheKey = `${anchor?.externalId ?? "none"}::${normaliseQuery(query)}`;
  const cached = runtime.searchResultCacheThisTurn.get(cacheKey);
  if (cached) return cached;

  const retrievalContext: RetrievalContext = {
    connectionId: context.connection.id,
    categoryScope: context.categoryScope,
    apiKey: context.geminiApiKey,
    query,
    recentTurns: context.recentTurns,
    anchor,
    shownExternalIds: runtime.shownProductIds,
    hardRules: context.hardRules,
    styleGuide: context.styleGuide,
    facets: context.facets,
    bundle: runtime.bundleState ?? context.bundleState,
    budgetMax,
    budgetMin,
    visitorId: context.visitorId,
  };

  try {
    const result = await runRetrieval(context.connection, retrievalContext);

    runtime.anchor = result.anchor ?? anchor;
    runtime.bundleState = result.bundleState ?? runtime.bundleState;

    if (result.question) {
      runtime.pendingQuestion = { question: result.question, quickOptions: result.quickOptions ?? [] };
      const outcome = {
        resultForModel: JSON.stringify({ question: result.question, quickOptions: result.quickOptions ?? [] }),
        events: result.quickOptions?.length ? [{ type: "quick_options" as const, options: result.quickOptions }] : [],
      };
      runtime.searchResultCacheThisTurn.set(cacheKey, outcome);
      return outcome;
    }

    const bundleMemberIds = new Set(result.bundles?.flatMap((bundle) => bundle.externalIds) ?? []);
    const products = capForUi(result.products, bundleMemberIds);

    for (const product of products) {
      runtime.knownProducts.set(product.id, product);
      if (!runtime.shownProductIds.includes(product.id)) runtime.shownProductIds.push(product.id);
    }

    if (products.length > 0) {
      runtime.searchCallsThisTurn.push({ products, mode: result.mode, query, note: result.note });
    }

    runtime.lastAttributionToken = result.attributionToken;
    void recordSearchEvent({
      connectionId: context.connection.id,
      visitorId: context.visitorId,
      searchQuery: query,
      resultExternalIds: products.map((p) => p.id),
      attributionToken: result.attributionToken,
    });

    if (result.bundles?.length) {
      runtime.bundlesThisTurn = result.bundles;
    }

    const outcome = {
      resultForModel: JSON.stringify({
        count: products.length,
        mode: result.mode,
        note: result.note,
        bundles: result.bundles,
        products: summarise(products),
      }),
      events: [{ type: "products" as const, products, note: result.note }],
    };
    runtime.searchResultCacheThisTurn.set(cacheKey, outcome);
    return outcome;
  } catch (err) {
    console.error("[persona search_catalog]", err);
    // Deliberately not cached: a transient failure should get a real retry, not be locked in as
    // this turn's answer for the same query.
    return { resultForModel: JSON.stringify({ error: "Catalog search failed." }), events: [] };
  }
}

/** The engine's candidate shape, from a rendered product — enough for anchor resolution, which
 *  only needs identity, title and taxonomy. */
function toCandidateShape(product: {
  id: string;
  name: string;
  categoryId: string;
  price: number;
  currency: string;
  imageUrl: string;
  inStock: boolean;
  description: string;
  attributes?: Record<string, string[]>;
}): CatalogCandidate {
  return {
    externalId: product.id,
    productGroupId: null,
    title: product.name,
    brand: null,
    categoryPaths: product.categoryId ? [[product.categoryId]] : [],
    garmentCategory: null,
    garmentSubcategory: null,
    price: product.price,
    currency: product.currency,
    inStock: product.inStock,
    productUrl: null,
    imageUrl: product.imageUrl,
    enrichedDescription: product.description,
    attributes: product.attributes,
  };
}

/**
 * The path retrieval takes before the catalog has finished indexing.
 *
 * Kept deliberately: a merchant who connects a store should get a working assistant in the
 * minutes before their catalog is embedded, not an agent that reports an empty shelf. It is
 * the last piece of the old live-search pipeline still in use, and retires once indexing is
 * proven in production.
 */
async function liveSearchFallback(
  query: string,
  maxPrice: number | undefined,
  context: WearableChatContext,
  runtime: ToolRuntimeState
): Promise<{ resultForModel: string; events: WearableAgentEvent[] }> {
  try {
    const { products } = await searchCatalog({
      ownerId: context.userId,
      query,
      maxPrice,
      limit: MAX_UI_RESULTS,
    });

    for (const product of products) runtime.knownProducts.set(product.id, product);
    if (products.length > 0) {
      runtime.searchCallsThisTurn.push({ products, mode: "cosine", query });
    }

    const note = "This store's catalog is still being indexed, so these are live search results rather than the full ranked set.";

    return {
      resultForModel: JSON.stringify({ count: products.length, note, products: summarise(products) }),
      events: [{ type: "products", products, note }],
    };
  } catch (err) {
    console.error("[persona search_catalog fallback]", err);
    const message = err instanceof CatalogSearchError ? err.message : "Catalog search failed.";
    return { resultForModel: JSON.stringify({ error: message }), events: [] };
  }
}

export { toAnchor };
