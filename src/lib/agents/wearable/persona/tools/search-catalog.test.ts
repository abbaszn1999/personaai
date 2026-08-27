import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnchorState, RetrievalContext } from "@/lib/retrieval/types";
import type { Product } from "@/modules/shopping-agent/types";
import type { ToolRuntimeState, WearableChatContext } from "../types";

// Pulled in transitively by the live-store fallback path, which these tests never reach.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SECRET_KEY ??= "test-key";

const runRetrieval = vi.fn();

vi.mock("../engine", () => ({
  runRetrieval: (...args: unknown[]) => runRetrieval(...args),
}));

vi.mock("@/lib/catalog/acs/user-events", () => ({
  recordSearchEvent: () => Promise.resolve(),
}));

const { handleSearchCatalog } = await import("./search-catalog");

function product(id: string, name: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    name,
    price: 40,
    currency: "USD",
    imageUrl: "https://cdn.example.com/a.jpg",
    inStock: true,
    categoryId: "Men",
    description: "",
    rating: 0,
    reviewCount: 0,
    ...overrides,
  } as Product;
}

function anchor(externalId: string, title: string): AnchorState {
  return {
    externalId,
    productGroupId: `group-${externalId}`,
    title,
    brand: null,
    category: "Men",
    subcategory: null,
    enrichedDescription: null,
    garmentCategory: null,
  };
}

function context(overrides: Partial<WearableChatContext> = {}): WearableChatContext {
  return {
    userId: "user-1",
    visitorId: "visitor-1",
    geminiApiKey: "key",
    creditsRemaining: 10,
    categoryScope: ["424"],
    profile: {} as WearableChatContext["profile"],
    outfitItems: [],
    knownProducts: [],
    intake: {},
    storeProductCount: 100,
    categories: [],
    connection: { id: "conn-1" } as WearableChatContext["connection"],
    catalogReady: true,
    facets: { categories: [], brands: [], priceRange: null },
    hardRules: [],
    styleGuide: null,
    recentTurns: [],
    anchor: null,
    anchorPinned: false,
    bundleState: null,
    discussedBundleItems: [],
    shownProductIds: [],
    ...overrides,
  };
}

function runtime(overrides: Partial<ToolRuntimeState> = {}): ToolRuntimeState {
  return {
    knownProducts: new Map(),
    searchCallsThisTurn: [],
    intake: {},
    creditsRemaining: 10,
    profilePatch: {},
    anchor: null,
    bundleState: null,
    shownProductIds: [],
    bundlesThisTurn: [],
    pendingQuestion: null,
    lastAttributionToken: undefined,
    searchResultCacheThisTurn: new Map(),
    ...overrides,
  };
}

/** The anchor `handleSearchCatalog` decided on, as handed to the engine. */
function anchorSentToEngine(): AnchorState | null {
  return (runRetrieval.mock.calls[0][1] as RetrievalContext).anchor;
}

beforeEach(() => {
  runRetrieval.mockReset().mockResolvedValue({ mode: "cosine", products: [] });
});

const shown = [product("p1", "Brushed Cotton Tee"), product("p2", "Modal Blend Tee"), product("p3", "Waffle Knit Tee")];

describe("handleSearchCatalog — pinned anchor precedence", () => {
  it("keeps the pinned product when the shopper uses an ordinal", async () => {
    await handleSearchCatalog(
      { query: "what about the third one" },
      context({ anchor: anchor("p1", "Brushed Cotton Tee"), anchorPinned: true }),
      runtime({ searchCallsThisTurn: [{ products: shown, mode: "cosine", query: "tees" }] })
    );

    expect(anchorSentToEngine()?.externalId).toBe("p1");
  });

  it("resolves the ordinal normally when nothing is pinned", async () => {
    await handleSearchCatalog(
      { query: "what about the third one" },
      context({ anchor: anchor("p1", "Brushed Cotton Tee"), anchorPinned: false }),
      runtime({ searchCallsThisTurn: [{ products: shown, mode: "cosine", query: "tees" }] })
    );

    expect(anchorSentToEngine()?.externalId).toBe("p3");
  });

  it("yields the pin to a product the shopper names outright", async () => {
    await handleSearchCatalog(
      { query: "actually the Waffle Knit Tee" },
      context({ anchor: anchor("p1", "Brushed Cotton Tee"), anchorPinned: true }),
      runtime({ searchCallsThisTurn: [{ products: shown, mode: "cosine", query: "tees" }] })
    );

    expect(anchorSentToEngine()?.externalId).toBe("p3");
  });

  it("stops protecting the pin once an earlier search this turn moved off it", async () => {
    // The pin covers one product, not the anchor slot in general. Once the shopper has named
    // something else mid-turn, a later ordinal in the same turn refers to that new context.
    await handleSearchCatalog(
      { query: "and the second one" },
      context({ anchor: anchor("p1", "Brushed Cotton Tee"), anchorPinned: true }),
      runtime({
        anchor: anchor("p3", "Waffle Knit Tee"),
        searchCallsThisTurn: [{ products: shown, mode: "cosine", query: "tees" }],
      })
    );

    expect(anchorSentToEngine()?.externalId).toBe("p2");
  });

  it("ignores the flag when no anchor stands behind it", async () => {
    await handleSearchCatalog(
      { query: "the second one" },
      context({ anchor: null, anchorPinned: true }),
      runtime({ searchCallsThisTurn: [{ products: shown, mode: "cosine", query: "tees" }] })
    );

    expect(anchorSentToEngine()?.externalId).toBe("p2");
  });
});

describe("handleSearchCatalog — result summary", () => {
  it("includes description and attributes for a freshly shown product so it can be discussed without a second search", async () => {
    runRetrieval.mockResolvedValue({
      mode: "cosine",
      products: [
        product("p9", "Field Jacket", {
          description: "A rugged shell built for wet-weather commutes.",
          // Store-specific, not colour/size, so this can't pass by accident.
          attributes: { collar_type: ["Mandarin"] },
        }),
      ],
    });

    const { resultForModel } = await handleSearchCatalog({ query: "a rugged jacket" }, context(), runtime());
    const parsed = JSON.parse(resultForModel);

    expect(parsed.products[0].description).toBe("A rugged shell built for wet-weather commutes.");
    expect(parsed.products[0].attributes).toEqual({ collar_type: ["Mandarin"] });
  });

  it("omits description and attributes entirely when the product has none", async () => {
    runRetrieval.mockResolvedValue({ mode: "cosine", products: [product("p9", "Field Jacket")] });

    const { resultForModel } = await handleSearchCatalog({ query: "a rugged jacket" }, context(), runtime());
    const parsed = JSON.parse(resultForModel);

    expect(parsed.products[0]).not.toHaveProperty("description");
    expect(parsed.products[0]).not.toHaveProperty("attributes");
  });
});

/**
 * The display cap is sized for a flat carousel, but a bundle turn's products are one-per-category
 * per outfit and each is load-bearing: `buildAttachmentPlan` drops any outfit whose members don't
 * all resolve, so truncating a product deletes a whole outfit rather than shortening a list. Five
 * three-piece outfits exceeded the cap of 10, which silently deleted every outfit and rendered
 * the turn as a handful of loose tops.
 */
describe("handleSearchCatalog — display cap on a bundle turn", () => {
  /** Five 3-piece outfits over 15 distinct products, ordered by category as the engine returns
   *  them: five tops, then five bottoms, then five footwear. */
  function bundleTurn() {
    const categories = ["tops", "bottoms", "footwear"];
    const products = categories.flatMap((category) =>
      Array.from({ length: 5 }, (_, i) => product(`${category}-${i}`, `${category} ${i}`))
    );
    const bundles = Array.from({ length: 5 }, (_, i) => ({
      externalIds: categories.map((category) => `${category}-${i}`),
      items: categories.map((category) => ({ externalId: `${category}-${i}`, category, price: 40 })),
      rationale: `Outfit ${i}`,
    }));
    return { mode: "bundle", products, bundles };
  }

  it("keeps every product an assembled outfit is built from, past the flat-list cap", async () => {
    runRetrieval.mockResolvedValue(bundleTurn());
    const state = runtime();

    await handleSearchCatalog({ query: "a full sport outfit" }, context(), state);

    for (const category of ["tops", "bottoms", "footwear"]) {
      for (let i = 0; i < 5; i++) {
        expect(state.knownProducts.has(`${category}-${i}`)).toBe(true);
      }
    }
  });

  it("keeps the last category, which the cap used to cut off entirely", async () => {
    runRetrieval.mockResolvedValue(bundleTurn());
    const state = runtime();

    await handleSearchCatalog({ query: "a full sport outfit" }, context(), state);

    expect([...state.knownProducts.keys()].filter((id) => id.startsWith("footwear"))).toHaveLength(5);
  });

  it("still caps a plain search with no bundles at 10", async () => {
    runRetrieval.mockResolvedValue({
      mode: "cosine",
      products: Array.from({ length: 24 }, (_, i) => product(`p${i}`, `Tee ${i}`)),
    });
    const state = runtime();

    await handleSearchCatalog({ query: "tees" }, context(), state);

    expect(state.knownProducts.size).toBe(10);
  });

  it("caps surplus products around the bundle members rather than dropping the members", async () => {
    const turn = bundleTurn();
    runRetrieval.mockResolvedValue({
      ...turn,
      products: [...turn.products, ...Array.from({ length: 6 }, (_, i) => product(`extra-${i}`, `Extra ${i}`))],
    });
    const state = runtime();

    await handleSearchCatalog({ query: "a full sport outfit" }, context(), state);

    expect(state.knownProducts.size).toBe(15);
    expect([...state.knownProducts.keys()].some((id) => id.startsWith("extra"))).toBe(false);
  });
});

describe("handleSearchCatalog — duplicate current-item lookups within one turn", () => {
  it("returns the same grounded result without a second retrieval call for a repeated (anchor, query) pair", async () => {
    runRetrieval.mockResolvedValue({ mode: "attribute_variant", products: [], note: "Here's what I know." });

    const sharedRuntime = runtime({ anchor: anchor("p1", "Lightweight Bomber Jacket") });
    const ctx = context({ anchor: anchor("p1", "Lightweight Bomber Jacket") });

    const first = await handleSearchCatalog({ query: "what sizes does it have?" }, ctx, sharedRuntime);
    const second = await handleSearchCatalog({ query: "what sizes does it have?" }, ctx, sharedRuntime);

    expect(runRetrieval).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("tolerates trivial rewording/casing of the same repeated question", async () => {
    runRetrieval.mockResolvedValue({ mode: "attribute_variant", products: [], note: "Here's what I know." });

    const sharedRuntime = runtime({ anchor: anchor("p1", "Lightweight Bomber Jacket") });
    const ctx = context({ anchor: anchor("p1", "Lightweight Bomber Jacket") });

    await handleSearchCatalog({ query: "  What Sizes does it have?  " }, ctx, sharedRuntime);
    await handleSearchCatalog({ query: "what sizes does it have?" }, ctx, sharedRuntime);

    expect(runRetrieval).toHaveBeenCalledTimes(1);
  });

  it("still retrieves again for a genuinely different question about the same item", async () => {
    runRetrieval.mockResolvedValue({ mode: "attribute_variant", products: [], note: "Here's what I know." });

    const sharedRuntime = runtime({ anchor: anchor("p1", "Lightweight Bomber Jacket") });
    const ctx = context({ anchor: anchor("p1", "Lightweight Bomber Jacket") });

    await handleSearchCatalog({ query: "what sizes does it have?" }, ctx, sharedRuntime);
    await handleSearchCatalog({ query: "does it come in another colour?" }, ctx, sharedRuntime);

    expect(runRetrieval).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed retrieval, so a retry actually retries", async () => {
    runRetrieval.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ mode: "cosine", products: [] });

    const sharedRuntime = runtime({ anchor: anchor("p1", "Lightweight Bomber Jacket") });
    const ctx = context({ anchor: anchor("p1", "Lightweight Bomber Jacket") });

    const first = await handleSearchCatalog({ query: "what sizes does it have?" }, ctx, sharedRuntime);
    const second = await handleSearchCatalog({ query: "what sizes does it have?" }, ctx, sharedRuntime);

    expect(runRetrieval).toHaveBeenCalledTimes(2);
    expect(JSON.parse(first.resultForModel)).toEqual({ error: "Catalog search failed." });
    expect(JSON.parse(second.resultForModel)).not.toEqual({ error: "Catalog search failed." });
  });
});
