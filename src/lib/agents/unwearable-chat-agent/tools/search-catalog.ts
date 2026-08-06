import type { ToolDefinition } from "@/lib/ai/openai";
import { searchCatalog, CatalogSearchError } from "@/lib/catalog/search-catalog";
import { parseBudgetMax } from "@/lib/recommendations";
import { selectTopProducts } from "../skills/select-products";
import type { ToolRuntimeState, UnwearableAgentEvent, UnwearableChatContext } from "../types";

/** Most results ever shown to the shopper (chat cards + model summary) for one search call —
 *  keeps the carousel usable and the per-call token cost bounded even on a catalog with
 *  thousands of matches. */
const MAX_UI_RESULTS = 10;

/** How many candidates we pull from the connected store to rank internally before trimming
 *  down to MAX_UI_RESULTS — same knob (and env var) as the wearable agent, so both agents'
 *  search depth is tuned in one place. */
const CATALOG_SEARCH_POOL_SIZE = Math.max(
  Math.round(Number(process.env.CATALOG_SEARCH_POOL_SIZE) || 100),
  MAX_UI_RESULTS
);

export const searchCatalogTool: ToolDefinition = {
  type: "function",
  name: "search_catalog",
  description:
    "Searches the merchant's live connected store for real products matching a query. Always call this before describing or recommending any specific product — never invent names, prices, or availability. " +
    "Keep `query` SHORT — one to three concrete words like a product-type/brand/model term ('mesh router', '4k monitor', 'noise cancelling headphones'), never a full sentence or filler words like 'show me' or 'available' — the store's search matches literal text, so short concrete terms find far more real matches than a natural-language phrase. " +
    "If the shopper names one of the synced categories, pass its id (or its name) as `category` — this searches reliably even without a matching text query. " +
    "The result includes a `matchType`: \"exact\" means it matched what you asked for directly; \"partial\" means it fell back to a broader match (e.g. the whole category, or a simplified keyword) — mention that briefly to the shopper instead of presenting it as a precise match; \"broad\" means nothing specific matched and this is a general browse of the selected catalog; \"none\" means the store genuinely has nothing available for this right now.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "1-3 concrete keywords, e.g. 'mesh router' or 'standing desk'. Avoid full sentences." },
      category: {
        type: "string",
        description: "Optional store category id or name to narrow the search to, if it clearly matches one of the synced categories listed in your instructions.",
      },
      maxPrice: { type: "number", description: "Optional maximum price." },
      limit: { type: "integer", description: "Max results to return (default 6, max 10)." },
    },
    required: ["query"],
  },
};

export async function handleSearchCatalog(
  args: Record<string, unknown>,
  context: UnwearableChatContext,
  runtime: ToolRuntimeState
): Promise<{ resultForModel: string; events: UnwearableAgentEvent[] }> {
  const query = typeof args.query === "string" ? args.query : "";
  const categoryId = typeof args.category === "string" ? args.category : undefined;
  const explicitMaxPrice = typeof args.maxPrice === "number" ? args.maxPrice : undefined;
  const limit = typeof args.limit === "number" ? Math.min(Math.max(Math.round(args.limit), 1), MAX_UI_RESULTS) : 6;

  // Prefer the model's explicit maxPrice; otherwise derive one from intake budget so the
  // shopper's stated budget actually constrains live search without relying on the LLM.
  const parsedBudget = parseBudgetMax(runtime.intake.budget ?? context.intake.budget);
  const maxPrice = explicitMaxPrice ?? parsedBudget ?? undefined;

  try {
    const { products, matchType } = await searchCatalog({
      ownerId: context.userId,
      query,
      categoryId,
      maxPrice,
      // Fetch a full candidate pool (not just `limit`) so ranking picks the true best matches
      // out of the whole search result, not just whatever the store's own search ranked first.
      limit: CATALOG_SEARCH_POOL_SIZE,
    });

    const { products: ranked } = await selectTopProducts({
      pool: products,
      query,
      categoryId,
      limit,
      apiKey: context.openaiApiKey,
      intake: runtime.intake,
      matchType,
      categories: context.categories,
    });

    for (const product of ranked) {
      runtime.knownProducts.set(product.id, product);
    }

    // Track every non-empty search for card emission. Solution Kits use these buckets too.
    if (ranked.length > 0) {
      runtime.searchCallsThisTurn.push({ products: ranked, matchType, query });
    }

    const summary = ranked.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      currency: p.currency,
      inStock: p.inStock,
      rating: p.rating,
    }));

    return {
      resultForModel: JSON.stringify({ count: ranked.length, matchType, products: summary }),
      events: [{ type: "products", products: ranked, matchType }],
    };
  } catch (err) {
    console.error("[unwearable-chat-agent search_catalog]", err);
    const message = err instanceof CatalogSearchError ? err.message : "Catalog search failed.";
    return { resultForModel: JSON.stringify({ error: message }), events: [] };
  }
}
