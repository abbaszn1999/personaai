import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogCandidate } from "@/lib/retrieval/types";
import type { BundleCandidatePool } from "../stylist";

const mocks = vi.hoisted(() => ({ generateContent: vi.fn() }));

vi.mock("@/lib/ai/gemini", () => ({
  getGeminiClient: () => ({ models: { generateContent: mocks.generateContent } }),
}));

const { allocateBudget, applyBudgetShares, MIN_ITEMS_PER_CATEGORY } = await import("./allocate");

function candidate(externalId: string, price: number | null): CatalogCandidate {
  return {
    externalId,
    productGroupId: null,
    title: `Item ${externalId}`,
    brand: null,
    categoryPaths: [["Men"]],
    garmentCategory: "tops",
    garmentSubcategory: null,
    price,
    currency: "USD",
    inStock: true,
    productUrl: null,
    imageUrl: "https://cdn.example.com/a.jpg",
    enrichedDescription: null,
  };
}

function pool(category: string, prices: Array<number | null>): BundleCandidatePool {
  return { category, candidates: prices.map((price, i) => candidate(`${category}-${i}`, price)) };
}

describe("applyBudgetShares — pure trimming core", () => {
  it("trims each pool to items priced at or under its own dollar share", () => {
    const pools = [
      pool("tops", [10, 20, 30, 40, 50, 60, 100, 120, 140]),
      pool("bottoms", [30, 60, 90, 120, 150]),
    ];
    const result = applyBudgetShares(pools, { tops: 0.25, bottoms: 0.75 }, 400);

    const tops = result.find((r) => r.category === "tops")!;
    expect(tops.budgetShare).toBe(100);
    expect(tops.candidates.every((c) => (c.price ?? 0) <= 100)).toBe(true);
    expect(tops.candidates.length).toBeLessThan(9);

    const bottoms = result.find((r) => r.category === "bottoms")!;
    expect(bottoms.budgetShare).toBe(300);
    expect(bottoms.candidates).toHaveLength(5);
  });

  it("never empties a category — passes it through untrimmed when the floor can't be met within its share", () => {
    // Every item is priced above the tiny share this category is given.
    const pools = [pool("outerwear", [500, 600, 700, 800, 900, 1000])];
    const result = applyBudgetShares(pools, { outerwear: 0.05 }, 200);

    expect(result[0].candidates).toHaveLength(6);
    expect(result[0].budgetShare).toBe(10);
  });

  it("keeps a category whose affordable set is smaller than the floor by falling back to the untrimmed pool", () => {
    const prices = [10, 20, 500, 600, 700];
    const pools = [pool("tops", prices)];
    // Only 2 of 5 items are within the share — below MIN_ITEMS_PER_CATEGORY.
    const result = applyBudgetShares(pools, { tops: 1 }, 25);

    expect(MIN_ITEMS_PER_CATEGORY).toBeGreaterThan(2);
    expect(result[0].candidates).toHaveLength(prices.length);
  });

  it("treats an unpriced candidate as always affordable", () => {
    const pools = [pool("tops", [null, 10, 20, 30, 500, 600, 700])];
    const result = applyBudgetShares(pools, { tops: 1 }, 100);

    expect(result[0].candidates.some((c) => c.price === null)).toBe(true);
  });

  it("falls back to an even split for a category with no explicit share", () => {
    const pools = [pool("tops", [10]), pool("bottoms", [10])];
    const result = applyBudgetShares(pools, {}, 100);

    expect(result[0].budgetShare).toBe(50);
    expect(result[1].budgetShare).toBe(50);
  });
});

describe("allocateBudget", () => {
  beforeEach(() => {
    mocks.generateContent.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("passes every pool through untouched when no budget was stated", async () => {
    const pools = [pool("tops", [10, 20]), pool("bottoms", [30, 40])];
    const result = await allocateBudget({ pools, totalBudget: null, styleGuide: null, query: "an outfit", apiKey: "k" });

    expect(mocks.generateContent).not.toHaveBeenCalled();
    expect(result).toEqual(pools.map((p) => ({ ...p, budgetShare: null })));
  });

  it("normalises the model's percentages and allocates accordingly", async () => {
    mocks.generateContent.mockResolvedValue({
      text: JSON.stringify({ shares: [{ category: "tops", percent: 30 }, { category: "bottoms", percent: 70 }] }),
    });

    const pools = [pool("tops", [50, 250]), pool("bottoms", [50, 250])];
    const result = await allocateBudget({ pools, totalBudget: 100, styleGuide: null, query: "an outfit", apiKey: "k" });

    expect(result.find((r) => r.category === "tops")?.budgetShare).toBe(30);
    expect(result.find((r) => r.category === "bottoms")?.budgetShare).toBe(70);
  });

  it("allocations across categories never exceed the total budget", async () => {
    mocks.generateContent.mockResolvedValue({
      text: JSON.stringify({ shares: [{ category: "tops", percent: 40 }, { category: "bottoms", percent: 60 }] }),
    });

    const pools = [pool("tops", [50]), pool("bottoms", [50])];
    const result = await allocateBudget({ pools, totalBudget: 200, styleGuide: null, query: "an outfit", apiKey: "k" });

    const sum = result.reduce((total, r) => total + (r.budgetShare ?? 0), 0);
    expect(sum).toBeLessThanOrEqual(200);
  });

  it("falls back to an equal split when the model call fails", async () => {
    mocks.generateContent.mockRejectedValue(new Error("quota exceeded"));

    const pools = [pool("tops", [10, 20]), pool("bottoms", [10, 20])];
    const result = await allocateBudget({ pools, totalBudget: 100, styleGuide: null, query: "an outfit", apiKey: "k" });

    expect(result[0].budgetShare).toBe(50);
    expect(result[1].budgetShare).toBe(50);
  });

  it("falls back to an equal split when the model omits a named category", async () => {
    mocks.generateContent.mockResolvedValue({
      text: JSON.stringify({ shares: [{ category: "tops", percent: 100 }] }),
    });

    const pools = [pool("tops", [10]), pool("bottoms", [10])];
    const result = await allocateBudget({ pools, totalBudget: 100, styleGuide: null, query: "an outfit", apiKey: "k" });

    expect(result[0].budgetShare).toBe(50);
    expect(result[1].budgetShare).toBe(50);
  });
});
