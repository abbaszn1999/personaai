import { describe, expect, it } from "vitest";
import type { AcsSearchResultItem } from "./types";
import {
  buildChartScopeFilter,
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
    fitGroup: "tops",
    fitAudience: "mens",
    chartVariant: "Men's Core",
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
      categories: ["persona", "persona > men > top > t-shirt"],
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
  it("accepts an explicit no-brand selection and the measurements that apply", () => {
    const parsed = parseFitSearchQuery(new URLSearchParams({
      brand: "",
      fitGroup: "footwear",
      fitAudience: "womens",
      chartVariant: "Women's Shoes",
      footLength: "24.5",
    }));

    expect(parsed).toEqual({
      ok: true,
      value: {
        brand: null,
        fitGroup: "footwear",
        fitAudience: "womens",
        chartVariant: "Women's Shoes",
        measurements: { foot_length: 24.5 },
      },
    });
  });

  it("requires the group's deciding measurement", () => {
    const parsed = parseFitSearchQuery(new URLSearchParams({
      brand: "Acme", fitGroup: "tops", fitAudience: "mens", chartVariant: "Core", waist: "80",
    }));
    expect(parsed).toEqual({ ok: false, error: "chest is required to size tops." });
  });

  it("rejects measurements that do not apply and unknown groups", () => {
    const base = { brand: "Acme", fitAudience: "mens", chartVariant: "Core", chest: "95" };
    expect(parseFitSearchQuery(new URLSearchParams({ ...base, fitGroup: "tops", hip: "99" }))).toMatchObject({ ok: false });
    expect(parseFitSearchQuery(new URLSearchParams({ ...base, fitGroup: "hats" }))).toMatchObject({ ok: false });
    expect(parseFitSearchQuery(new URLSearchParams({ ...base, fitGroup: "tops", chest: "-4" }))).toMatchObject({ ok: false });
  });
});

describe("buildFitSearchFilter", () => {
  it("sends the brand, the chart, the department and the fit window for the deciding measurement only", () => {
    const filter = buildFitSearchFilter(query())!;
    expect(filter).toBe(
      '(brands: ANY("Acme")) AND ' +
        '(attributes.fit_group: ANY("tops") AND attributes.fit_chest_min: IN(*, 97i) AND attributes.fit_chest_max: IN(93i, *)) AND ' +
        '(attributes.fit_audience: ANY("mens")) AND ' +
        `(attributes.fit_chart_variant: ANY("Men's Core")) AND ` +
        '(availability: ANY("IN_STOCK"))'
    );
    expect(filter).not.toContain("fit_waist");
    expect(filter).not.toContain("fit_size_labels");
  });

  it("builds the chart scope without any body measurement", () => {
    expect(buildChartScopeFilter(query())).toBe(
      '(brands: ANY("Acme")) AND (attributes.fit_audience: ANY("mens")) AND ' +
        `(attributes.fit_chart_variant: ANY("Men's Core")) AND (availability: ANY("IN_STOCK"))`,
    );
  });

  it("cannot scope no-brand in ACS", () => {
    expect(buildFitSearchFilter(query({ brand: null }))).not.toContain("brands:");
  });

  it("reports the tolerance applied to each deciding measurement", () => {
    expect(fitSearchTolerances(query())).toEqual([{ measurement: "chest", value: 95, tolerance: 2 }]);
  });
});

describe("toFitSearchProducts", () => {
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
  });

  it("keeps a product ACS returned even when none of its stocked sizes fits", () => {
    // S (88-92) and XL (110-114) stretch the product's all-sizes range over chest 95.
    const { products } = toFitSearchProducts(
      [result(`${CONNECTION_ID}_p1`, [{ s: "S", chest: [88, 92] }, { s: "XL", chest: [110, 114] }], {
        attributes: {
          fit_size_labels: { text: ["S", "XL"] },
          fit_rows: { text: ['{"s":"S","chest":[88,92]}', '{"s":"XL","chest":[110,114]}'] },
        },
      })],
      query({ measurements: { chest: 98 } }),
      CONNECTION_ID,
    );
    expect(products).toHaveLength(1);
    expect(products[0].fitSizes).toEqual([]);
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
