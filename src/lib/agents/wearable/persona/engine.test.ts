import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import type { CatalogCandidate, CatalogFacets, RetrievalContext } from "@/lib/retrieval/types";

const mocks = vi.hoisted(() => ({
  routeRequest: vi.fn(),
  cosineRun: vi.fn(),
  buildCandidatePools: vi.fn(),
  assembleBundles: vi.fn(),
  allocateBudget: vi.fn(),
  getCatalogFacets: vi.fn(),
  getCatalogProductsByExternalIds: vi.fn(),
}));

vi.mock("./router", () => ({ routeRequest: mocks.routeRequest }));
vi.mock("./registry", () => ({
  DIRECT_SKILLS: { cosine: { run: mocks.cosineRun }, attribute_variant: { run: mocks.cosineRun } },
}));
vi.mock("./modes/bundle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./modes/bundle")>();
  return { ...actual, buildCandidatePools: mocks.buildCandidatePools, assembleBundles: mocks.assembleBundles };
});
vi.mock("../budget-allocator", () => ({ allocateBudget: mocks.allocateBudget }));
vi.mock("@/lib/catalog/acs/catalog-reads", () => ({
  getCatalogFacets: mocks.getCatalogFacets,
  getCatalogProductsByExternalIds: mocks.getCatalogProductsByExternalIds,
}));

const { runRetrieval } = await import("./engine");

const CONNECTION_ID = "11111111-1111-1111-1111-111111111111";

/** The zero-candidate paths never touch the connection, so a cast beats fabricating a full row. */
const connection = { id: CONNECTION_ID } as StoreConnectionRow;

const stockedFacets: CatalogFacets = {
  categories: [{ category: "outerwear", subcategory: "jacket" }],
  brands: ["Acme"],
  priceRange: { min: 10, max: 500 },
};

function candidate(externalId: string, garmentCategory: string): CatalogCandidate {
  return {
    externalId,
    productGroupId: null,
    title: externalId,
    brand: null,
    categoryPaths: [["Men"]],
    garmentCategory,
    garmentSubcategory: null,
    price: 50,
    currency: "USD",
    inStock: true,
    productUrl: null,
    imageUrl: null,
    enrichedDescription: null,
  };
}

function context(overrides: Partial<RetrievalContext> = {}): RetrievalContext {
  return {
    connectionId: CONNECTION_ID,
    categoryScope: ["424"],
    apiKey: "test-key",
    query: "i need a black jacket",
    recentTurns: [],
    anchor: null,
    shownExternalIds: [],
    hardRules: [],
    styleGuide: null,
    facets: stockedFacets,
    bundle: null,
    visitorId: "visitor-1",
    ...overrides,
  };
}

describe("runRetrieval — when a mode finds nothing", () => {
  beforeEach(() => {
    mocks.getCatalogFacets.mockResolvedValue(stockedFacets);
    mocks.routeRequest.mockResolvedValue({ mode: "cosine" });
    mocks.cosineRun.mockResolvedValue({ candidates: [], steps: [{ relaxed: null, count: 0 }] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks about the occasion only when the catalog really does have stock to search", async () => {
    const result = await runRetrieval(connection, context());

    expect(result.question).toContain("occasion");
    // Nothing is wrong here — the shopper's query simply missed — so this must not be logged as
    // a fault or it drowns the cases that are.
    expect(console.error).not.toHaveBeenCalled();
  });

  it("says no categories are switched on rather than asking the shopper a pointless question", async () => {
    const result = await runRetrieval(connection, context({ categoryScope: [] }));

    expect(result.question).toBeUndefined();
    expect(result.note).toContain("No product categories are switched on");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("no categories selected"));
  });

  it("says the catalog is unreachable when the scope holds no products at all", async () => {
    // Empty facets mean the per-turn browse over the whole scope came back with nothing, which is
    // the exact failure that spent a day disguised as an over-eager intake step.
    mocks.getCatalogFacets.mockResolvedValue({ categories: [], brands: [], priceRange: null });
    const result = await runRetrieval(connection, context());

    expect(result.question).toBeUndefined();
    expect(result.note).toContain("can't reach this store's catalog");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("the catalog is empty or ACS is unreachable"));
  });

  it("answers a variant miss directly instead of asking about the occasion", async () => {
    // The shopper already named the item and asked what it comes in — "what's the occasion?"
    // responds to a request they never made. This is the exact turn the pinned-anchor bug
    // exposed: attribute_variant routed correctly, found nothing, and fell through to the
    // generic ask meant for open-ended misses.
    mocks.routeRequest.mockResolvedValue({ mode: "attribute_variant" });

    const result = await runRetrieval(
      connection,
      context({
        query: "is there black color of this?",
        anchor: {
          externalId: "p1",
          productGroupId: null,
          title: "Long Sleeve Nylon Windbreaker",
          brand: null,
          category: "Men",
          subcategory: "Clothing",
          enrichedDescription: null,
          garmentCategory: null,
        },
      })
    );

    expect(result.question).toBeUndefined();
    expect(result.note).toContain("Long Sleeve Nylon Windbreaker");
    expect(result.note).toContain("any other options");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("still names the item generically when no anchor survived to answer with", async () => {
    mocks.routeRequest.mockResolvedValue({ mode: "attribute_variant" });

    const result = await runRetrieval(connection, context({ query: "other colors?", anchor: null }));

    expect(result.question).toBeUndefined();
    expect(result.note).toContain("this item");
  });

  it("leads a variant miss with whatever description/attributes are already known about the anchor", async () => {
    mocks.routeRequest.mockResolvedValue({ mode: "attribute_variant" });

    const result = await runRetrieval(
      connection,
      context({
        query: "does this come in something else?",
        anchor: {
          externalId: "p1",
          productGroupId: null,
          title: "Long Sleeve Nylon Windbreaker",
          brand: null,
          category: "Men",
          subcategory: "Clothing",
          enrichedDescription: "A packable shell for wet commutes.",
          // Store-specific, not colour/size, so this can't pass by accident.
          attributes: { collar_type: ["Mandarin"] },
          garmentCategory: null,
        },
      })
    );

    expect(result.note).toContain("A packable shell for wet commutes.");
    expect(result.note).toContain("collar_type: Mandarin");
  });

  it("logs the mode, scope, rung counts and filter for every retrieval", async () => {
    mocks.cosineRun.mockResolvedValue({
      candidates: [],
      filter: { category: "outerwear", priceMax: 200, excludeExternalIds: ["a", "b"] },
      steps: [
        { relaxed: null, count: 0 },
        { relaxed: "price-ceiling", count: 0 },
      ],
    });

    await runRetrieval(connection, context());

    const line = vi
      .mocked(console.log)
      .mock.calls.map((call) => call[0] as string)
      .find((entry) => entry.startsWith("[persona retrieval]"));
    expect(line).toBeDefined();
    expect(line).toContain("mode=cosine");
    expect(line).toContain("scope=1");
    expect(line).toContain("candidates=0");
    // An all-zero ladder is the signature of a scope problem rather than a filter that was too
    // tight, which is the distinction the counts exist to make.
    expect(line).toContain("rungs=none:0,price-ceiling:0");
    // The exclusion list grows without bound and is summarised to its length.
    expect(line).toContain('"excluded":2');
    expect(line).not.toContain('"a"');
  });
});

describe("runRetrieval — bundle mode's strict intake gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.routeRequest.mockResolvedValue({ mode: "bundle" });
    mocks.getCatalogFacets.mockResolvedValue(stockedFacets);
    mocks.getCatalogProductsByExternalIds.mockResolvedValue([]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks for a category before anything else when no scope is named or carried", async () => {
    const result = await runRetrieval(connection, context({ query: "help me get dressed", bundle: null }));

    expect(result.question).toBeDefined();
    expect(result.bundleState?.scope).toEqual([]);
  });

  it("asks for a budget once a category is known but no budget is set", async () => {
    const result = await runRetrieval(
      connection,
      context({ query: "I need a shirt and pants", bundle: null, budgetMax: undefined })
    );

    expect(result.question).toBeDefined();
    expect(result.bundleState?.scope).toEqual(["tops", "bottoms"]);
  });

  it("builds every requested category immediately once category and budget are known", async () => {
    const pools = [
      { category: "tops", candidates: [candidate("top-1", "tops")] },
      { category: "bottoms", candidates: [candidate("bottom-1", "bottoms")] },
    ];
    mocks.buildCandidatePools.mockResolvedValue(pools);
    mocks.allocateBudget.mockResolvedValue(pools.map((pool) => ({ ...pool, budgetShare: 150 })));
    mocks.assembleBundles.mockResolvedValue([]);

    const result = await runRetrieval(
      connection,
      context({
        query: "build the full outfit",
        bundle: { scope: ["tops", "bottoms"], locked: {} },
        budgetMax: 300,
      })
    );

    expect(result.question).toBeUndefined();
    expect(mocks.buildCandidatePools).toHaveBeenCalledWith(expect.anything(), ["tops", "bottoms"]);
    expect(mocks.allocateBudget).toHaveBeenCalled();
    expect(mocks.assembleBundles).toHaveBeenCalled();
  });

  it("uses an explicitly selected anchor without asking the shopper to choose a starting item", async () => {
    const pools = [{ category: "bottoms", candidates: [candidate("bottom-1", "bottoms")] }];
    mocks.buildCandidatePools.mockResolvedValue(pools);
    mocks.allocateBudget.mockResolvedValue([{ ...pools[0], budgetShare: 300 }]);
    mocks.assembleBundles.mockResolvedValue([]);

    const result = await runRetrieval(
      connection,
      context({
        query: "this one",
        budgetMax: 300,
        bundle: { scope: ["tops", "bottoms"], locked: {} },
        anchor: {
          externalId: "top-1",
          productGroupId: null,
          title: "Linen Shirt",
          brand: null,
          category: "Men",
          subcategory: "Shirts",
          enrichedDescription: null,
          garmentCategory: "tops",
        },
      })
    );

    expect(result.bundleState?.locked).toEqual({ tops: "top-1" });
    expect(result.question).toBeUndefined();
    expect(mocks.buildCandidatePools).toHaveBeenCalledWith(expect.anything(), ["bottoms"]);
  });

  it("runs the budget allocator between buildCandidatePools and assembleBundles", async () => {
    const rawPools = [
      { category: "bottoms", candidates: [candidate("bottom-1", "bottoms")] },
      { category: "shoes", candidates: [candidate("shoe-1", "footwear")] },
    ];
    const allocatedPools = [
      { category: "bottoms", candidates: [], budgetShare: 100 },
      { category: "shoes", candidates: [], budgetShare: 200 },
    ];
    mocks.buildCandidatePools.mockResolvedValue(rawPools);
    mocks.allocateBudget.mockResolvedValue(allocatedPools);
    mocks.assembleBundles.mockResolvedValue([]);

    await runRetrieval(
      connection,
      context({
        query: "let's build the rest of the outfit",
        budgetMax: 300,
        anchor: {
          externalId: "top-1",
          productGroupId: null,
          title: "Waffle Knit Tee",
          brand: null,
          category: "Men",
          subcategory: "Clothing",
          enrichedDescription: null,
          garmentCategory: "tops",
        },
        bundle: {
          scope: ["tops", "bottoms", "shoes"],
          locked: {},
        },
      })
    );

    expect(mocks.allocateBudget).toHaveBeenCalledWith(
      expect.objectContaining({ pools: rawPools, totalBudget: 300 })
    );
    expect(mocks.getCatalogFacets).toHaveBeenCalledOnce();
    // assembleBundles must receive the allocator's trimmed pools, not the raw ones it replaced.
    expect(mocks.assembleBundles).toHaveBeenCalledWith(expect.anything(), allocatedPools, null);
  });

  it("never reaches the allocator when the strict gate blocks on a missing budget", async () => {
    await runRetrieval(
      connection,
      context({
        query: "let's build both",
        budgetMax: undefined,
        bundle: { scope: ["tops", "bottoms"], locked: {} },
      })
    );

    expect(mocks.buildCandidatePools).not.toHaveBeenCalled();
    expect(mocks.allocateBudget).not.toHaveBeenCalled();
    expect(mocks.getCatalogFacets).not.toHaveBeenCalled();
  });

  /**
   * "Discuss this bundle" pins an outfit to talk about; it is not a statement that the outfit
   * being built is finished. Treating it as one marked every category settled, so the next
   * request for an outfit had nothing left to fill and returned no products at all.
   */
  describe("with an outfit pinned for discussion", () => {
    const discussedBundle = {
      scope: ["tops", "bottoms", "footwear"],
      locked: {},
      discussed: [
        { externalId: "top-1", category: "tops", price: 40 },
        { externalId: "bottom-1", category: "bottoms", price: 60 },
        { externalId: "shoe-1", category: "footwear", price: 90 },
      ],
    };

    function fullPools() {
      const pools = [
        { category: "tops", candidates: [candidate("top-2", "tops")] },
        { category: "bottoms", candidates: [candidate("bottom-2", "bottoms")] },
        { category: "footwear", candidates: [candidate("shoe-2", "footwear")] },
      ];
      mocks.buildCandidatePools.mockResolvedValue(pools);
      mocks.allocateBudget.mockResolvedValue(pools.map((pool) => ({ ...pool, budgetShare: 100 })));
      mocks.assembleBundles.mockResolvedValue([]);
    }

    it("builds a fresh outfit instead of reporting nothing left to fill", async () => {
      fullPools();

      const result = await runRetrieval(
        connection,
        context({ query: "build me another full outfit", budgetMax: 300, bundle: { ...discussedBundle } })
      );

      expect(mocks.buildCandidatePools).toHaveBeenCalledWith(expect.anything(), ["tops", "bottoms", "footwear"]);
      expect(result.note).not.toContain("already filled");
    });

    it("does not lock the pinned outfit's categories", async () => {
      fullPools();

      const result = await runRetrieval(
        connection,
        context({ query: "build me another full outfit", budgetMax: 300, bundle: { ...discussedBundle } })
      );

      expect(result.bundleState?.locked).toEqual({});
    });

    it("keeps the pinned outfit on the state, so a follow-up swap can still resolve against it", async () => {
      fullPools();

      const result = await runRetrieval(
        connection,
        context({ query: "build me another full outfit", budgetMax: 300, bundle: { ...discussedBundle } })
      );

      expect(result.bundleState?.discussed).toHaveLength(3);
    });
  });

  it("never labels a partial category set as a complete bundle", async () => {
    mocks.buildCandidatePools.mockResolvedValue([
      { category: "tops", candidates: [candidate("top-1", "tops")] },
      { category: "bottoms", candidates: [candidate("bottom-1", "bottoms")] },
      { category: "footwear", candidates: [] },
    ]);

    const result = await runRetrieval(
      connection,
      context({
        query: "build the full outfit",
        budgetMax: 300,
        bundle: { scope: ["tops", "bottoms", "footwear"], locked: {} },
      })
    );

    expect(result.bundles).toBeUndefined();
    expect(result.note).toContain("footwear");
    expect(mocks.allocateBudget).not.toHaveBeenCalled();
    expect(mocks.assembleBundles).not.toHaveBeenCalled();
  });
});
