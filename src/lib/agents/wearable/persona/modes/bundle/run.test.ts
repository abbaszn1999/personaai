import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BundleState, CatalogCandidate, RetrievalContext } from "@/lib/retrieval/types";

const mocks = vi.hoisted(() => ({
  runCosineMode: vi.fn(),
  acsFilterCatalogProducts: vi.fn(),
}));

vi.mock("../cosine", () => ({ runCosineMode: mocks.runCosineMode }));
vi.mock("@/lib/catalog/acs/search-adapter", () => ({ acsFilterCatalogProducts: mocks.acsFilterCatalogProducts }));

const { detectBundleScope, remainingCategories, buildCandidatePools } = await import("./run");

describe("detectBundleScope", () => {
  it("scopes to the named garments when the shopper lists them", () => {
    expect(detectBundleScope("I need a shirt and some pants")).toEqual(["tops", "bottoms"]);
  });

  it("falls back to a default full-outfit scope for a bare 'full outfit' request — the exact " +
    "phrasing that previously returned empty and looped the strict gate forever", () => {
    expect(detectBundleScope("Can you build me a full outfit bundle?")).toEqual(["tops", "bottoms", "footwear"]);
  });

  it("resolves the app's own 'A full outfit' quick-reply chip, not just free text", () => {
    expect(detectBundleScope("A full outfit")).toEqual(["tops", "bottoms", "footwear"]);
  });

  it("prefers a named garment over the full-outfit default when both are present", () => {
    expect(detectBundleScope("a full outfit built around a leather jacket")).toEqual(["outerwear"]);
  });

  it("returns empty for a message naming neither a garment nor 'outfit'/'bundle' wording", () => {
    expect(detectBundleScope("Work")).toEqual([]);
  });
});

describe("remainingCategories", () => {
  function state(overrides: Partial<BundleState> = {}): BundleState {
    return { scope: ["tops", "bottoms"], locked: {}, ...overrides };
  }

  it("excludes categories already locked", () => {
    expect(remainingCategories(state({ locked: { tops: "p1" } }))).toEqual(["bottoms"]);
  });

  it("returns the full scope when nothing is locked yet", () => {
    expect(remainingCategories(state())).toEqual(["tops", "bottoms"]);
  });
});

/**
 * The AI-written statement each category's semantic search runs against is a single live call
 * with nothing to check it against — confirmed directly against a real catalog, near-identical
 * phrasings for the same category can return 100 results or zero. A thin result must fall back
 * to a plain category/price/stock browse rather than let one unlucky category collapse the
 * entire bundle, which is the bug this covers.
 */
describe("buildCandidatePools", () => {
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
      query: "full sport full bundle",
      recentTurns: [],
      anchor: null,
      shownExternalIds: [],
      hardRules: [],
      styleGuide: null,
      facets: { categories: [], brands: [], priceRange: null },
      bundle: null,
      budgetMax: 800,
      visitorId: "visitor-1",
      ...overrides,
    } as RetrievalContext;
  }

  function candidates(prefix: string, count: number, category: string): CatalogCandidate[] {
    return Array.from({ length: count }, (_, i) => candidate(`${prefix}-${i}`, category));
  }

  beforeEach(() => {
    mocks.runCosineMode.mockReset();
    mocks.acsFilterCatalogProducts.mockReset();
  });

  it("uses the statement's own results when they clear the usefulness bar", async () => {
    mocks.runCosineMode.mockResolvedValue({ candidates: candidates("statement", 16, "tops") });

    const [pool] = await buildCandidatePools(context(), ["tops"]);

    expect(pool.candidates).toHaveLength(16);
    expect(mocks.acsFilterCatalogProducts).not.toHaveBeenCalled();
  });

  it("falls back to a plain browse of that category when the statement comes back thin", async () => {
    mocks.runCosineMode.mockResolvedValue({ candidates: candidates("statement", 2, "tops") });
    mocks.acsFilterCatalogProducts.mockResolvedValue(candidates("browse", 40, "tops"));

    const [pool] = await buildCandidatePools(context(), ["tops"]);

    expect(pool.candidates.length).toBe(42);
    expect(mocks.acsFilterCatalogProducts).toHaveBeenCalledTimes(1);
  });

  it("keeps the thin statement's own matches rather than discarding them for the browse pass", async () => {
    mocks.runCosineMode.mockResolvedValue({ candidates: candidates("statement", 2, "tops") });
    mocks.acsFilterCatalogProducts.mockResolvedValue(candidates("browse", 40, "tops"));

    const [pool] = await buildCandidatePools(context(), ["tops"]);

    expect(pool.candidates.some((c) => c.externalId.startsWith("statement"))).toBe(true);
  });

  it("does not duplicate a product the statement and the browse pass both found", async () => {
    const shared = candidate("shared-1", "tops");
    mocks.runCosineMode.mockResolvedValue({ candidates: [shared] });
    mocks.acsFilterCatalogProducts.mockResolvedValue([shared, candidate("browse-1", "tops")]);

    const [pool] = await buildCandidatePools(context(), ["tops"]);

    expect(pool.candidates.filter((c) => c.externalId === "shared-1")).toHaveLength(1);
    expect(pool.candidates).toHaveLength(2);
  });

  it("resolves each category independently, so one falling back doesn't affect the others", async () => {
    mocks.runCosineMode.mockImplementation(async (_ctx: RetrievalContext, opts: { targetCategory: string }) => ({
      candidates: opts.targetCategory === "tops" ? [] : candidates(opts.targetCategory, 20, opts.targetCategory),
    }));
    mocks.acsFilterCatalogProducts.mockResolvedValue(candidates("browse", 30, "tops"));

    const pools = await buildCandidatePools(context(), ["tops", "bottoms", "footwear"]);

    expect(pools.find((p) => p.category === "tops")?.candidates).toHaveLength(30);
    expect(pools.find((p) => p.category === "bottoms")?.candidates).toHaveLength(20);
    expect(pools.find((p) => p.category === "footwear")?.candidates).toHaveLength(20);
    expect(mocks.acsFilterCatalogProducts).toHaveBeenCalledTimes(1);
  });

  it("still reports a truly empty category when even the plain browse finds nothing", async () => {
    mocks.runCosineMode.mockResolvedValue({ candidates: [] });
    mocks.acsFilterCatalogProducts.mockResolvedValue([]);

    const [pool] = await buildCandidatePools(context(), ["tops"]);

    expect(pool.candidates).toHaveLength(0);
  });

  it("carries the stated minimum price into the category filter, not just the ceiling", async () => {
    mocks.runCosineMode.mockResolvedValue({ candidates: candidates("statement", 10, "bottoms") });

    await buildCandidatePools(context({ budgetMax: 800, budgetMin: 300 }), ["bottoms"]);

    const [, options] = mocks.runCosineMode.mock.calls[0] as [RetrievalContext, { filterOverride: { priceMin?: number; priceMax?: number } }];
    expect(options.filterOverride).toMatchObject({ priceMin: 300, priceMax: 800 });
  });
});
