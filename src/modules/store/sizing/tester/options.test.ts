import { describe, expect, it } from "vitest";
import type { SizingChartRow } from "@/lib/db/sizing-charts";
import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";
import {
  buildSizingTesterOptions,
  chartRowToMultiSystemRow,
  testerPersonasForAudience,
} from "./options";

function coverage(overrides: Partial<SizingCoverageRow> = {}): SizingCoverageRow {
  return {
    id: "coverage-1",
    connectionId: "connection-1",
    brandKey: "nike",
    brandName: "Nike",
    brandType: "global",
    brandCanonicalName: "Nike",
    sizingCategory: "tops",
    skuCount: 12,
    storeCategoryPaths: [],
    sampleSkus: [],
    rawFormats: {},
    audienceHints: {},
    researchStatus: "found",
    researchNote: null,
    updatedAt: "2026-09-29T00:00:00.000Z",
    ...overrides,
  };
}

function chart(overrides: Partial<SizingChartRow> = {}): SizingChartRow {
  return {
    id: "chart-1",
    connectionId: null,
    brandKey: "nike",
    sizingCategory: "tops",
    variantName: "Men Regular",
    coversLeaves: ["men:top:t-shirt"],
    audience: "mens",
    sourceTitle: "Nike Tops",
    chartRows: [{
      size: "M",
      aliases: { alpha: "Medium", us: "US M", eu: "EU 48", uk: "UK 38" },
      chest_min: 96,
      chest_max: 104,
    }],
    confidence: 0.98,
    sourceUrl: "https://example.com/nike",
    provenance: "research",
    version: 1,
    updatedAt: "2026-09-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("Sizing Tester options adapter", () => {
  it("maps every stored audience to the tester personas", () => {
    expect(testerPersonasForAudience("mens")).toEqual(["men"]);
    expect(testerPersonasForAudience("womens")).toEqual(["women"]);
    expect(testerPersonasForAudience("boys")).toEqual(["kid"]);
    expect(testerPersonasForAudience("girls")).toEqual(["kid"]);
    expect(testerPersonasForAudience("kids")).toEqual(["kid"]);
    expect(testerPersonasForAudience("unisex")).toEqual(["men", "women"]);
  });

  it("keeps row order, labels, aliases, and the original chart row", () => {
    const source = {
      size: "M",
      aliases: { alpha: "Medium", us: "US M", eu: "EU 48", uk: "UK 38" },
      chest_min: 96,
      chest_max: 104,
      shoulder_min: 44,
      shoulder_max: 46,
    } as const;

    const row = chartRowToMultiSystemRow(source, "Official guide");

    expect(row).toMatchObject({
      sizeLabel: "M",
      usSize: "US M",
      euSize: "EU 48",
      ukSize: "UK 38",
      chestMin: 96,
      chestMax: 104,
      chestCm: "96–104",
      aliases: source.aliases,
      chartRow: source,
    });
    expect(row.chartRow).not.toBe(source);
  });

  it("maps year-based kid age aliases without treating month labels as years", () => {
    expect(chartRowToMultiSystemRow({ size: "128", aliases: { age: "7-8y" } })).toMatchObject({
      ageLabel: "7-8y",
      ageMin: 7,
      ageMax: 8,
    });
    expect(chartRowToMultiSystemRow({ size: "3M", aliases: { age: "3M" } })).not.toHaveProperty(
      "ageMin",
    );
  });

  it("returns only covered chart pairs and includes global, private, and No brand options", () => {
    const result = buildSizingTesterOptions(
      [
        coverage(),
        coverage({
          id: "private-coverage",
          brandKey: "house",
          brandName: "House",
          brandType: "private",
          brandCanonicalName: null,
          skuCount: 5,
        }),
        coverage({
          id: "none-coverage",
          brandKey: "",
          brandName: null,
          brandType: "none",
          brandCanonicalName: null,
          sizingCategory: "footwear",
          skuCount: 3,
        }),
      ],
      [
        chart(),
        chart({
          id: "private-chart",
          connectionId: "connection-1",
          brandKey: "house",
          variantName: "Unisex Relaxed",
          audience: "unisex",
          provenance: "merchant",
        }),
        chart({
          id: "none-chart",
          connectionId: "connection-1",
          brandKey: "",
          sizingCategory: "footwear",
          variantName: "Kids",
          audience: "girls",
          chartRows: [{ size: "30", aliases: { eu: "30" }, foot_length_min: 18.5 }],
          provenance: "manual",
        }),
        chart({ id: "uncovered", sizingCategory: "bottoms" }),
      ],
    );

    expect(result.brands.map((brand) => brand.name)).toEqual(["House", "Nike", "No brand"]);
    expect(result.brands.find((brand) => brand.name === "House")).toMatchObject({
      type: "private",
      coverageType: "private",
      skuCount: 5,
      categories: [{
        subcategories: [{
          rowsByPersona: { men: expect.any(Array), women: expect.any(Array) },
        }],
      }],
    });
    expect(result.brands.find((brand) => brand.name === "No brand")).toMatchObject({
      id: "no-brand",
      type: "private",
      coverageType: "none",
      skuCount: 3,
      categories: [{
        key: "footwear",
        subcategories: [{ rowsByPersona: { kid: expect.any(Array) } }],
      }],
    });
    expect(result.brands.flatMap((brand) => brand.categories).some((item) => item.key === "bottoms"))
      .toBe(false);
  });

  it("exposes every raw catalog brand name grouped under a canonical global brand", () => {
    const result = buildSizingTesterOptions(
      [coverage()],
      [chart()],
      new Map([["nike", [
        { brandKey: "nike", brandName: "Nike", skuCount: 8 },
        { brandKey: "nike_kids", brandName: "Nike Kids", skuCount: 4 },
      ]]]),
    );

    expect(result.brands[0]?.sourceBrandNames).toEqual(["Nike", "Nike Kids"]);
  });
});
