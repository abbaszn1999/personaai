import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONNECTION_ID } from "../__fixtures__/catalog";
import type { AgentContext } from "../types";
import type { SearchSpec } from "./acs-translator";

const acs = vi.hoisted(() => {
  class AcsApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly body: string
    ) {
      super(`ACS API error ${status}: ${body}`);
    }
  }
  return { searchProducts: vi.fn(), AcsApiError };
});
vi.mock("@/lib/catalog/acs/client", () => ({ searchProducts: acs.searchProducts, AcsApiError: acs.AcsApiError }));
vi.mock("@/lib/catalog/acs/user-events", () => ({ recordSearchEvent: vi.fn() }));
vi.mock("./hydrate", () => ({ hydrateLiveFacts: vi.fn() }));

import { searchCatalog } from "./search";

const ctx = {
  connection: { id: CONNECTION_ID },
  categoryScope: ["persona"],
  visitorId: "v1",
  session: { audience: "man", department: "men", budget: null, measurements: null },
} as unknown as AgentContext;
const fitted = {
  ...ctx,
  session: { ...ctx.session, measurements: { heightCm: 180, chestCm: 100, waistCm: 84, hipsCm: null, shoeSizeEu: null } },
} as AgentContext;
const spec: SearchSpec = { paths: ["men > top"], brands: [], priceMin: null, priceMax: 50, attributes: [], sizes: [], excludeIds: [] };

function item(id: string, uri: string | null, rows: object[] = [], variant?: string) {
  const acsId = variant ? `${CONNECTION_ID}_${id}::${variant}` : `${CONNECTION_ID}_${id}`;
  return {
    id: acsId,
    product: {
      id: acsId,
      type: variant ? "VARIANT" : "PRIMARY",
      title: id,
      categories: ["persona > men > top > t-shirt"],
      priceInfo: { currencyCode: "USD", price: 20 },
      availability: "IN_STOCK",
      images: uri ? [{ uri }] : [],
      attributes: {
        external_id: { text: [id] },
        connection_id: { text: [CONNECTION_ID] },
        ...(rows.length
          ? { fit_group: { text: ["tops"] }, fit_rows: { text: rows.map((row) => JSON.stringify(row)) } }
          : {}),
      },
    },
  };
}

describe("searchCatalog", () => {
  beforeEach(() => acs.searchProducts.mockReset());

  it("always searches through the isolated client with the store's scope and the translated filter", async () => {
    acs.searchProducts.mockResolvedValue({ results: [item("a", "https://x/a.jpg")] });
    const outcome = await searchCatalog(ctx, spec, "relaxed tee", 10);
    const call = acs.searchProducts.mock.calls[0][0];
    expect(call.connectionId).toBe(CONNECTION_ID);
    expect(call.categoryScope).toEqual(["persona"]);
    expect(call.extraFilter).toBe(outcome.filter);
    expect(call.extraFilter).toContain(`categories: ANY("persona > men > top")`);
    expect(call.extraFilter).toContain(`availability: ANY("IN_STOCK")`);
    expect(acs.searchProducts).toHaveBeenCalledTimes(1);
  });

  it("browses the same filter when the query matches nothing displayable", async () => {
    acs.searchProducts
      .mockResolvedValueOnce({ results: [item("no-image", null)] })
      .mockResolvedValueOnce({ results: [item("b", "https://x/b.jpg")] });
    const outcome = await searchCatalog(ctx, spec, "very specific styling words", 10);
    expect(acs.searchProducts.mock.calls.map((args) => args[0].query)).toEqual(["very specific styling words", ""]);
    expect(acs.searchProducts.mock.calls[1][0].extraFilter).toBe(outcome.filter);
    expect(outcome.candidates).toHaveLength(1);
  });

  it("does not browse again when the filter matched nothing, since that search is billed and cannot find more", async () => {
    acs.searchProducts.mockResolvedValue({ results: [] });
    const outcome = await searchCatalog(ctx, spec, "very specific styling words", 10);
    expect(acs.searchProducts).toHaveBeenCalledTimes(1);
    expect(outcome.candidates).toEqual([]);
  });

  it("with measurements, filters on fit and returns only products with a fitting size", async () => {
    acs.searchProducts.mockResolvedValue({
      results: [
        item("fits", "https://x/a.jpg", [{ s: "M", chest: [93, 98] }, { s: "L", chest: [99, 104] }]),
        item("too-small", "https://x/b.jpg", [{ s: "S", chest: [88, 92] }]),
        item("no-chart", "https://x/c.jpg"),
      ],
    });
    const outcome = await searchCatalog(fitted, spec, "", 10);
    expect(acs.searchProducts.mock.calls[0][0].extraFilter).toContain('attributes.fit_group: ANY("tops")');
    expect(outcome.candidates.map((candidate) => [candidate.externalId, candidate.fitSizes])).toEqual([["fits", ["L", "M"]]]);
  });

  it("judges a one-number chart across every record of the product in the page", async () => {
    acs.searchProducts.mockResolvedValue({
      results: [
        item("xint", "https://x/a.jpg", [{ s: "S", chest: [97, 97] }], "s1"),
        item("xint", "https://x/a.jpg", [{ s: "S", chest: [97, 97] }, { s: "M", chest: [101, 101] }]),
      ],
    });
    const outcome = await searchCatalog(fitted, spec, "", 10);
    expect(outcome.candidates.map((candidate) => candidate.fitSizes)).toEqual([["M"]]);
  });

  it("drops a fit group ACS does not index yet and retries", async () => {
    acs.searchProducts
      .mockRejectedValueOnce(
        new acs.AcsApiError(400, 'Unsupported field \\"attributes.fit_waist_cm\\" on \\":\\" operator.')
      )
      .mockResolvedValueOnce({ results: [] });
    await searchCatalog(fitted, spec, "", 10);
    expect(acs.searchProducts).toHaveBeenCalledTimes(2);
    expect(acs.searchProducts.mock.calls[1][0].extraFilter).not.toContain('"bottoms"');
    expect(acs.searchProducts.mock.calls[1][0].extraFilter).toContain('"tops"');
  });

  it("never searches without a store or a mapped scope", async () => {
    expect((await searchCatalog({ ...ctx, categoryScope: [] }, spec, "", 10)).candidates).toEqual([]);
    expect(acs.searchProducts).not.toHaveBeenCalled();
  });
});
