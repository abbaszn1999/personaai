import { describe, expect, it } from "vitest";
import type { AcsSearchResultItem } from "./types";
import {
  buildCategoryScopeFilter,
  buildFitSearchFilter,
  fitSearchTolerances,
  parseFitSearchQuery,
  toFitSearchProducts,
  type FitSearchQuery,
} from "./fit-search";

const CONNECTION_ID = "11111111-1111-1111-1111-111111111111";

function query(overrides: Partial<FitSearchQuery> = {}): FitSearchQuery {
  return {
    brand: "Acme",
    target: "men",
    fitGroup: "tops",
    measurements: { chest: 95, waist: 82 },
    ...overrides,
  };
}

function result(
  id: string,
  rows: object[],
  overrides: Partial<AcsSearchResultItem["product"]> = {},
): AcsSearchResultItem {
  return {
    id,
    product: {
      id,
      type: "PRIMARY",
      title: "Core tee",
      categories: ["persona", "persona > men", "persona > men > top", "persona > men > top > t-shirt"],
      brands: ["Acme"],
      availability: "IN_STOCK",
      sizes: ["M"],
      attributes: {
        sku: { text: ["TEE-M"] },
        fit_size_labels: { text: rows.map((row) => (row as { s: string }).s) },
        fit_rows: { text: rows.map((row) => JSON.stringify(row)) },
      },
      ...overrides,
    },
  };
}

describe("parseFitSearchQuery", () => {
  it("accepts an explicit no-brand selection, the target and the measurements that apply", () => {
    const parsed = parseFitSearchQuery(new URLSearchParams({
      brand: "",
      target: "women",
      fitGroup: "footwear",
      footLength: "24.5",
    }));

    expect(parsed).toEqual({
      ok: true,
      value: {
        brand: null,
        target: "women",
        fitGroup: "footwear",
        measurements: { foot_length: 24.5 },
      },
    });
  });

  it("requires the category's filtering measurement for the target", () => {
    const adult = parseFitSearchQuery(new URLSearchParams({ brand: "Acme", target: "men", fitGroup: "tops", waist: "80" }));
    expect(adult).toEqual({ ok: false, error: "chest is required to size tops." });

    const kid = parseFitSearchQuery(new URLSearchParams({ brand: "Acme", target: "kid", fitGroup: "tops", chest: "60" }));
    expect(kid).toEqual({ ok: false, error: "height is required to size tops." });
  });

  it("rejects a missing target, measurements that do not apply and unknown groups", () => {
    const base = { brand: "Acme", target: "men", chest: "95" };
    expect(parseFitSearchQuery(new URLSearchParams({ brand: "Acme", fitGroup: "tops", chest: "95" }))).toMatchObject({ ok: false });
    expect(parseFitSearchQuery(new URLSearchParams({ ...base, target: "teen", fitGroup: "tops" }))).toMatchObject({ ok: false });
    expect(parseFitSearchQuery(new URLSearchParams({ ...base, fitGroup: "tops", hip: "99" }))).toMatchObject({ ok: false });
    expect(parseFitSearchQuery(new URLSearchParams({ ...base, fitGroup: "tops", height: "180" }))).toMatchObject({ ok: false });
    expect(parseFitSearchQuery(new URLSearchParams({ ...base, fitGroup: "hats" }))).toMatchObject({ ok: false });
    expect(parseFitSearchQuery(new URLSearchParams({ ...base, fitGroup: "tops", chest: "-4" }))).toMatchObject({ ok: false });
  });
});

describe("buildFitSearchFilter", () => {
  it("sends the brand, the fit window for the filtering measurement only, the target's departments and stock", () => {
    const filter = buildFitSearchFilter(query())!;
    expect(filter).toBe(
      '(brands: ANY("Acme")) AND ' +
        '(attributes.fit_group: ANY("tops") AND attributes.fit_chest_cm: ANY("93", "94", "95", "96", "97")) AND ' +
        '(categories: ANY("persona > men", "persona > unisex")) AND ' +
        '(availability: ANY("IN_STOCK"))'
    );
    expect(filter).not.toContain("fit_waist");
    expect(filter).not.toContain("fit_chart_variant");
    expect(filter).not.toContain("fit_audience");
  });

  it("filters waist for bottoms, foot length for footwear and height for a kid", () => {
    expect(buildFitSearchFilter(query({ fitGroup: "bottoms", measurements: { waist: 84, hip: 99 } }))).toContain(
      'attributes.fit_group: ANY("bottoms") AND attributes.fit_waist_cm: ANY("82", "83", "84", "85", "86")',
    );
    expect(buildFitSearchFilter(query({ fitGroup: "bottoms", measurements: { waist: 84, hip: 99 } }))).not.toContain("fit_hip");
    expect(buildFitSearchFilter(query({ fitGroup: "footwear", measurements: { foot_length: 27 } }))).toContain(
      'attributes.fit_foot_length_cm: ANY("26.7", "26.8", "26.9", "27.0", "27.1", "27.2", "27.3")',
    );
    const kid = buildFitSearchFilter(query({ target: "kid", fitGroup: "tops", measurements: { height: 124, chest: 63 } }))!;
    expect(kid).toContain('attributes.fit_height_cm: ANY("119", "120", "121", "122", "123", "124", "125", "126", "127", "128", "129")');
    expect(kid).not.toContain("fit_chest");
    expect(kid).toContain('(categories: ANY("persona > kids-boys", "persona > kids-girls", "persona > kids-unisex"))');
  });

  it("builds the category scope without any body measurement", () => {
    expect(buildCategoryScopeFilter(query({ target: "women" }))).toBe(
      '(brands: ANY("Acme")) AND (attributes.fit_group: ANY("tops")) AND ' +
        '(categories: ANY("persona > women", "persona > unisex")) AND (availability: ANY("IN_STOCK"))',
    );
  });

  it("sends every raw brand name of a canonical brand, and cannot scope no-brand in ACS", () => {
    expect(buildFitSearchFilter(query({ brandAliases: ["Tom Tailor Men", "TOM TAILOR"] }))).toContain(
      '(brands: ANY("Tom Tailor Men") OR brands: ANY("TOM TAILOR"))',
    );
    expect(buildFitSearchFilter(query({ brand: null }))).not.toContain("brands:");
  });

  it("reports the tolerance applied to each filtering measurement", () => {
    expect(fitSearchTolerances(query())).toEqual([{ measurement: "chest", value: 95, tolerance: 2 }]);
    expect(fitSearchTolerances(query({ target: "kid", measurements: { height: 124 } }))).toEqual([
      { measurement: "height", value: 124, tolerance: 5 },
    ]);
  });
});

describe("toFitSearchProducts", () => {
  it("matches a body value between inclusive source bounds, not only exact endpoints", () => {
    const { products } = toFitSearchProducts(
      [result(`${CONNECTION_ID}_p52`, [{ s: "52", chest: [102, 105] }])],
      query({ measurements: { chest: 103 } }),
      CONNECTION_ID,
    );
    expect(products[0]?.fitSizes).toEqual(["52"]);
  });

  it("groups a variant under its parent and lists the stocked sizes that fit, best first", () => {
    const parentId = `${CONNECTION_ID}_p1`;
    const { products, outOfScope } = toFitSearchProducts([
      result(`${CONNECTION_ID}_p1::v1`, [{ s: "M", chest: [94, 98] }], { type: "VARIANT", primaryProductId: parentId }),
      result(`${CONNECTION_ID}_p1::v2`, [{ s: "L", chest: [99, 104] }], { type: "VARIANT", primaryProductId: parentId }),
    ], query(), CONNECTION_ID);

    expect(outOfScope).toBe(0);
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ id: "p1", brand: "Acme", sku: "TEE-M", fitSizes: ["M"], availability: "IN_STOCK" });
    expect(products[0].sizes.sort()).toEqual(["L", "M"]);
    expect(products[0].fitRows.sort()).toEqual(['{"s":"L","chest":[99,104]}', '{"s":"M","chest":[94,98]}']);
  });

  it("reads the Persona leaf of the requested category in the target's departments", () => {
    const { products } = toFitSearchProducts([
      result(`${CONNECTION_ID}_p1`, [{ s: "M", chest: [93, 98] }], {
        categories: [
          "persona", "persona > women", "persona > women > top", "persona > women > top > shirt",
          "persona > unisex", "persona > unisex > top", "persona > unisex > top > t-shirt",
        ],
      }),
      result(`${CONNECTION_ID}_p2`, [{ s: "M", chest: [93, 98] }], { categories: ["persona"] }),
    ], query(), CONNECTION_ID);

    expect(products[0]).toMatchObject({ leafKey: "unisex:top:t-shirt", personaPath: "persona > unisex > top > t-shirt" });
    expect(products[1]).toMatchObject({ leafKey: null, personaPath: null });
  });

  it("keeps a product ACS returned even when none of its stocked sizes fits", () => {
    // A stale index (published before a size sold out) can still return a product no stocked row fits.
    const { products } = toFitSearchProducts(
      [result(`${CONNECTION_ID}_p1`, [{ s: "S", chest: [88, 92] }, { s: "XL", chest: [110, 114] }])],
      query({ measurements: { chest: 98 } }),
      CONNECTION_ID,
    );
    expect(products).toHaveLength(1);
    expect(products[0].fitSizes).toEqual([]);
  });

  it("ranks a kid's sizes on height", () => {
    const { products } = toFitSearchProducts(
      [result(`${CONNECTION_ID}_k1`, [{ s: "116", height: [111, 116] }, { s: "128", height: [123, 128] }])],
      query({ target: "kid", measurements: { height: 124 } }),
      CONNECTION_ID,
    );
    expect(products[0]?.fitSizes).toEqual(["128"]);
  });

  it("scopes no-brand from the retrievable brands, since ACS cannot", () => {
    const { products, outOfScope } = toFitSearchProducts([
      result(`${CONNECTION_ID}_branded`, [{ s: "M", chest: [93, 98] }]),
      result(`${CONNECTION_ID}_plain`, [{ s: "M", chest: [93, 98] }], { brands: undefined }),
    ], query({ brand: null }), CONNECTION_ID);
    expect(products.map((product) => product.id)).toEqual(["plain"]);
    expect(outOfScope).toBe(1);
  });
});
