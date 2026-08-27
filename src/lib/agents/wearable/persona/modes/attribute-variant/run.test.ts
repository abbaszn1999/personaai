import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnchorState, CatalogCandidate, RetrievalContext } from "@/lib/retrieval/types";

const mocks = vi.hoisted(() => ({ getProductGroup: vi.fn() }));

vi.mock("@/lib/catalog/acs/catalog-reads", () => ({ getProductGroup: mocks.getProductGroup }));

const { runVariantMode } = await import("./run");

function candidate(externalId: string): CatalogCandidate {
  return {
    externalId,
    productGroupId: "group-1",
    title: `Sibling ${externalId}`,
    brand: null,
    categoryPaths: [["Men", "Jackets"]],
    garmentCategory: "outerwear",
    garmentSubcategory: "jacket",
    price: 100,
    currency: "USD",
    inStock: true,
    productUrl: null,
    imageUrl: "https://cdn.example.com/a.jpg",
    enrichedDescription: null,
  };
}

function anchor(overrides: Partial<AnchorState> = {}): AnchorState {
  return {
    externalId: "p1",
    productGroupId: "group-1",
    title: "Field Jacket",
    brand: "Acme",
    category: "Men",
    subcategory: "Jackets",
    enrichedDescription: null,
    garmentCategory: "outerwear",
    ...overrides,
  };
}

function context(overrides: Partial<RetrievalContext> = {}): RetrievalContext {
  return {
    connectionId: "conn-1",
    categoryScope: ["1"],
    apiKey: "key",
    query: "does this come in something else?",
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

describe("runVariantMode", () => {
  beforeEach(() => {
    mocks.getProductGroup.mockReset();
  });

  it("asks the caller for an anchor rather than searching blind", async () => {
    const outcome = await runVariantMode(context({ anchor: null }));
    expect(outcome.candidates).toEqual([]);
    expect(mocks.getProductGroup).not.toHaveBeenCalled();
  });

  it("leads verified sibling results with whatever is already known about the anchor", async () => {
    mocks.getProductGroup.mockResolvedValue([candidate("p1"), candidate("p2")]);

    const outcome = await runVariantMode(
      context({
        anchor: anchor({
          enrichedDescription: "A packable shell for wet commutes.",
          // Store-specific, not colour/size, so this can't pass by accident.
          attributes: { collar_type: ["Mandarin"] },
        }),
      })
    );

    expect(outcome.candidates.map((c) => c.externalId)).toEqual(["p2"]);
    expect(outcome.note).toContain("A packable shell for wet commutes.");
    expect(outcome.note).toContain("collar_type: Mandarin");
  });

  it("returns sibling results with no note when nothing is known beyond title/price/stock", async () => {
    mocks.getProductGroup.mockResolvedValue([candidate("p1"), candidate("p2")]);

    const outcome = await runVariantMode(context({ anchor: anchor() }));

    expect(outcome.candidates.map((c) => c.externalId)).toEqual(["p2"]);
    expect(outcome.note).toBeUndefined();
  });

  it("reports zero verified alternatives rather than substituting an unrelated similar item when there is no group", async () => {
    mocks.getProductGroup.mockResolvedValue([]);

    const outcome = await runVariantMode(
      context({ anchor: anchor({ productGroupId: null, enrichedDescription: "A packable shell for wet commutes." }) })
    );

    expect(mocks.getProductGroup).not.toHaveBeenCalled();
    expect(outcome.candidates).toEqual([]);
    expect(outcome.note).toBe("A packable shell for wet commutes.");
  });

  it("reports zero verified alternatives when the anchor's group has no other members", async () => {
    mocks.getProductGroup.mockResolvedValue([candidate("p1")]);

    const outcome = await runVariantMode(context({ anchor: anchor() }));

    expect(outcome.candidates).toEqual([]);
  });
});
