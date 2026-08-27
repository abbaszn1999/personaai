import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "@/lib/catalog/acs/client";
import type { RetrievalContext } from "@/lib/retrieval/types";
import * as filterBuilder from "./build-filter";
import { runFilterMode } from "./run";

const CONNECTION_ID = "11111111-1111-1111-1111-111111111111";

function baseContext(overrides: Partial<RetrievalContext> = {}): RetrievalContext {
  return {
    connectionId: CONNECTION_ID,
    categoryScope: ["cat-1"],
    apiKey: "test-key",
    query: "a cheap blue jacket",
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

describe("runFilterMode — relaxation ladder driven by the ACS adapter", () => {
  beforeEach(() => {
    vi.spyOn(filterBuilder, "buildFilter").mockResolvedValue({
      filter: { priceMax: 20, brand: "Acme" },
      corrections: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reissues the ACS search with a widened filter when the tight one is thin", async () => {
    const search = vi.spyOn(client, "searchProducts");
    // First rung (price + brand): thin. Second rung (brand only, price dropped): enough.
    search
      .mockResolvedValueOnce({ results: [{ id: `${CONNECTION_ID}_1`, product: candidateProduct("1") }] })
      .mockResolvedValueOnce({
        results: [
          { id: `${CONNECTION_ID}_1`, product: candidateProduct("1") },
          { id: `${CONNECTION_ID}_2`, product: candidateProduct("2") },
          { id: `${CONNECTION_ID}_3`, product: candidateProduct("3") },
        ],
      });

    const outcome = await runFilterMode(baseContext());

    expect(search).toHaveBeenCalledTimes(2);
    // First call still carries the price clause.
    expect(search.mock.calls[0][0].extraFilter).toContain("price: IN");
    // Second call is the "price-ceiling" rung — the ceiling dropped, brand still present.
    expect(search.mock.calls[1][0].extraFilter).not.toContain("price: IN");
    expect(search.mock.calls[1][0].extraFilter).toContain('brands: ANY("Acme")');
    expect(outcome.candidates).toHaveLength(3);
    expect(outcome.note).toContain("closest options slightly above it");
  });

  it("never calls ACS when the category scope is empty", async () => {
    const search = vi.spyOn(client, "searchProducts");
    const outcome = await runFilterMode(baseContext({ categoryScope: [] }));

    expect(search).not.toHaveBeenCalled();
    expect(outcome.candidates).toEqual([]);
  });
});

function candidateProduct(id: string) {
  return {
    id: `${CONNECTION_ID}_${id}`,
    type: "PRIMARY" as const,
    title: `Item ${id}`,
    categories: ["Men"],
    availability: "IN_STOCK" as const,
  };
}
