import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogCandidate, RetrievalContext } from "@/lib/retrieval/types";

const mocks = vi.hoisted(() => ({
  acsSearchCatalogProducts: vi.fn(),
  createChatCompletion: vi.fn(),
}));

vi.mock("@/lib/catalog/acs/search-adapter", () => ({
  acsSearchCatalogProducts: mocks.acsSearchCatalogProducts,
}));

vi.mock("@/lib/ai/gemini-chat", () => ({
  createChatCompletion: mocks.createChatCompletion,
}));

// The relaxation ladder is tested on its own terms elsewhere — here it would just add extra
// calls whenever a mocked result is below its usefulness threshold. Stubbed to call through
// once with the filter as given, so each assertion below maps to exactly one ACS call.
vi.mock("../../search", () => ({
  searchWithRelaxation: async (
    _connectionId: string,
    filter: unknown,
    run: (filter: unknown) => Promise<unknown[]>
  ) => ({ candidates: await run(filter), relaxed: null, exhausted: true, steps: [] }),
}));

const { runCosineMode } = await import("./run");

function candidate(externalId: string, category: string): CatalogCandidate {
  return {
    externalId,
    productGroupId: null,
    title: `Item ${externalId}`,
    brand: null,
    categoryPaths: [["Men"]],
    garmentCategory: category,
    garmentSubcategory: null,
    price: 50,
    currency: "USD",
    inStock: true,
    productUrl: null,
    imageUrl: "https://cdn.example.com/a.jpg",
    enrichedDescription: null,
  };
}

function context(overrides: Partial<RetrievalContext> = {}): RetrievalContext {
  return {
    connectionId: "conn-1",
    categoryScope: ["424"],
    apiKey: "test-key",
    query: "replace the pants",
    recentTurns: [],
    anchor: null,
    shownExternalIds: [],
    hardRules: [],
    styleGuide: null,
    facets: { categories: [], brands: [], priceRange: null },
    bundle: null,
    visitorId: "visitor-1",
    ...overrides,
  };
}

describe("runCosineMode — bundle swap resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createChatCompletion.mockResolvedValue({ content: "a pair of pants" });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("scopes the search to the one discussed item a swap message names", async () => {
    mocks.acsSearchCatalogProducts.mockResolvedValueOnce([candidate("new-bottom", "bottoms")]);

    const result = await runCosineMode(
      context({
        query: "can you replace the pants?",
        bundle: {
          scope: ["tops", "bottoms"],
          locked: { tops: "top-1", bottoms: "bottom-1" },
          discussed: [
            { externalId: "top-1", category: "tops", price: 40 },
            { externalId: "bottom-1", category: "bottoms", price: 60 },
          ],
        },
      })
    );

    expect(result.candidates.map((c) => c.externalId)).toEqual(["new-bottom"]);
    expect(mocks.acsSearchCatalogProducts).toHaveBeenCalledTimes(1);
    const [, filter] = mocks.acsSearchCatalogProducts.mock.calls[0];
    expect(filter.garmentCategory).toBe("bottoms");
    expect(filter.priceMax).toBe(60);
  });

  it("runs one scoped search per item when several are named at once", async () => {
    mocks.acsSearchCatalogProducts
      .mockResolvedValueOnce([candidate("new-top", "tops")])
      .mockResolvedValueOnce([candidate("new-shoe", "footwear")]);

    const result = await runCosineMode(
      context({
        query: "swap the shirt and the shoes",
        bundle: {
          scope: ["tops", "footwear"],
          locked: {},
          discussed: [
            { externalId: "top-1", category: "tops", price: 40 },
            { externalId: "shoe-1", category: "footwear", price: 90 },
          ],
        },
      })
    );

    expect(result.candidates.map((c) => c.externalId).sort()).toEqual(["new-shoe", "new-top"]);
    expect(mocks.acsSearchCatalogProducts).toHaveBeenCalledTimes(2);
  });

  it("falls through to a normal open-ended search when discussed items exist but nothing matches", async () => {
    mocks.acsSearchCatalogProducts.mockResolvedValueOnce([candidate("p1", "tops")]);

    const result = await runCosineMode(
      context({
        query: "does this run true to size?",
        bundle: {
          scope: ["tops"],
          locked: {},
          discussed: [{ externalId: "top-1", category: "tops", price: 40 }],
        },
      })
    );

    expect(result.candidates.map((c) => c.externalId)).toEqual(["p1"]);
    expect(mocks.acsSearchCatalogProducts).toHaveBeenCalledTimes(1);
  });
});
