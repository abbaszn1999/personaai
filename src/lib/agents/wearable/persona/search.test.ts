import { describe, expect, it, vi } from "vitest";
import { buildRelaxationLadder, searchWithRelaxation, seedFromConversation } from "./search";
import type { CatalogCandidate, CatalogFilter } from "@/lib/retrieval/types";

function candidates(count: number): CatalogCandidate[] {
  return Array.from({ length: count }, (_, index) => ({
    externalId: `p${index}`,
    productGroupId: null,
    title: `Product ${index}`,
    brand: null,
    categoryPaths: [["tops", "t-shirt"]],
    garmentCategory: "tops",
    garmentSubcategory: "t-shirt",
    price: 40,
    currency: "USD",
    inStock: true,
    productUrl: null,
    imageUrl: null,
    enrichedDescription: null,
  }));
}

const fullFilter: CatalogFilter = {
  category: "tops",
  subcategory: "t-shirt",
  brand: "Adidas",
  priceMax: 50,
};

describe("buildRelaxationLadder", () => {
  it("gives up constraints cheapest-first: price, then brand, then subcategory", () => {
    expect(buildRelaxationLadder(fullFilter).map((step) => step.relaxed)).toEqual([
      null,
      "price-ceiling",
      "brand",
      "subcategory",
    ]);
  });

  it("never drops the category", () => {
    // Past this point the honest answer is a question, not more results.
    const ladder = buildRelaxationLadder(fullFilter);
    expect(ladder.every((step) => step.filter.category === "tops")).toBe(true);
  });

  it("records what every rung returned, including the rungs it stopped short of", async () => {
    const run = vi.fn().mockResolvedValueOnce(candidates(1)).mockResolvedValueOnce(candidates(5));

    const outcome = await searchWithRelaxation("conn-1", fullFilter, run);

    // Stopping at the second rung must still leave a trace of the first — a ladder that reads
    // "none:0" then stops is a very different diagnosis from one that never ran.
    expect(outcome.steps).toEqual([
      { relaxed: null, count: 1 },
      { relaxed: "price-ceiling", count: 5 },
    ]);
  });

  it("records a zero for every rung when nothing matches at any width", async () => {
    const outcome = await searchWithRelaxation("conn-1", fullFilter, vi.fn().mockResolvedValue([]));

    expect(outcome.steps.map((step) => step.count)).toEqual([0, 0, 0, 0]);
    expect(outcome.exhausted).toBe(true);
  });

  it("relaxes cumulatively rather than one constraint at a time", () => {
    const last = buildRelaxationLadder(fullFilter).at(-1)!;
    expect(last.filter).toEqual({ category: "tops" });
  });

  it("skips rungs for constraints that were never set", () => {
    expect(buildRelaxationLadder({ category: "tops", brand: "Adidas" }).map((step) => step.relaxed)).toEqual([
      null,
      "brand",
    ]);
  });

  it("gives up the ceiling before the floor, one rung each", () => {
    const ladder = buildRelaxationLadder({ category: "tops", priceMin: 10, priceMax: 50 });

    // Dropped together, a shopper who set only one of the two gets told about the other. The
    // rung is what the note is derived from, so it has to name the concession precisely.
    expect(ladder.map((step) => step.relaxed)).toEqual([null, "price-ceiling", "price-floor"]);
    expect(ladder[1].filter).toMatchObject({ priceMin: 10 });
    expect(ladder[1].filter.priceMax).toBeUndefined();
    expect(ladder[2].filter.priceMin).toBeUndefined();
  });

  it("relaxes a floor-only filter without inventing a ceiling rung", () => {
    // "A jacket, minimum $200": there is no budget to be over, so there is no budget rung.
    const ladder = buildRelaxationLadder({ garmentSubcategory: "jacket", priceMin: 200 });
    expect(ladder.map((step) => step.relaxed)).toEqual([null, "price-floor", "garment-type"]);
  });

  it("produces a single rung when there is nothing to relax", () => {
    expect(buildRelaxationLadder({ category: "tops" })).toHaveLength(1);
  });

  it("widens the garment type before the store's own subcategory", () => {
    const ladder = buildRelaxationLadder({
      category: "Men",
      subcategory: "Clothing",
      garmentCategory: "outerwear",
      garmentSubcategory: "jacket",
    });

    // "jacket" is the narrower claim: giving it up still leaves outerwear, which a shopper who
    // asked for a jacket will mostly accept. Giving up "Clothing" leaves only "Men".
    expect(ladder.map((step) => step.relaxed)).toEqual([null, "garment-type", "subcategory"]);
  });

  it("never drops the garment category, only the type beneath it", () => {
    const ladder = buildRelaxationLadder({ garmentCategory: "outerwear", garmentSubcategory: "jacket" });
    expect(ladder.every((step) => step.filter.garmentCategory === "outerwear")).toBe(true);
    expect(ladder.at(-1)!.filter.garmentSubcategory).toBeUndefined();
  });

  it("leaves the caller's filter untouched", () => {
    const original = { ...fullFilter };
    buildRelaxationLadder(fullFilter);
    expect(fullFilter).toEqual(original);
  });
});

describe("searchWithRelaxation", () => {
  it("stops at the first rung that returns enough, without loosening further", () => {
    const run = vi.fn().mockResolvedValue(candidates(5));
    return searchWithRelaxation("conn", fullFilter, run).then((outcome) => {
      expect(run).toHaveBeenCalledTimes(1);
      expect(outcome.relaxed).toBeNull();
      expect(outcome.candidates).toHaveLength(5);
    });
  });

  it("walks down the ladder while results are empty", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(candidates(4));

    const outcome = await searchWithRelaxation("conn", fullFilter, run);

    expect(run).toHaveBeenCalledTimes(3);
    expect(outcome.relaxed).toBe("brand");
  });

  it("keeps the best thin result rather than returning nothing", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(candidates(2))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const outcome = await searchWithRelaxation("conn", fullFilter, run);

    expect(outcome.candidates).toHaveLength(2);
    expect(outcome.exhausted).toBe(false);
  });

  it("reports exhaustion when every rung comes back empty", async () => {
    const outcome = await searchWithRelaxation("conn", fullFilter, vi.fn().mockResolvedValue([]));

    expect(outcome.candidates).toHaveLength(0);
    expect(outcome.exhausted).toBe(true);
  });
});

describe("seedFromConversation", () => {
  it("is stable for the same conversation", () => {
    const turns = [{ content: "show me some shirts" }, { content: "under $50" }];
    expect(seedFromConversation(turns)).toBe(seedFromConversation([...turns]));
  });

  it("differs across conversations, so two shoppers don't get an identical slice", () => {
    // The bug that started this project: no ordering at all meant every shopper asking the
    // same question saw the same items in the same order.
    expect(seedFromConversation([{ content: "shirts" }])).not.toBe(seedFromConversation([{ content: "shoes" }]));
  });

  it("stays within the unit interval", () => {
    const seed = seedFromConversation([{ content: "a".repeat(2000) }]);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(1);
  });
});
