import { describe, expect, it } from "vitest";
import { buildIdentification, buildRouting } from "./routing";
import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";
import type { SizingNullRecordRow } from "@/lib/db/sizing-null-records";

function coverage(overrides: Partial<SizingCoverageRow> = {}): SizingCoverageRow {
  return {
    id: "c1",
    connectionId: "conn",
    brandKey: "nike",
    brandName: "Nike",
    brandType: "global",
    sizingCategory: "tops",
    skuCount: 10,
    storeCategoryPaths: [["Men", "Tops"]],
    sampleSkus: [],
    rawFormats: {},
    audienceHints: {},
    researchStatus: "pending",
    researchNote: null,
    updatedAt: "2026-09-03T00:00:00Z",
    ...overrides,
  };
}

function nullRecord(overrides: Partial<SizingNullRecordRow> = {}): SizingNullRecordRow {
  return {
    id: "n1",
    connectionId: "conn",
    externalId: "4823",
    sku: "SKU-4823",
    title: "Linen Shirt",
    sizingCategory: "tops",
    ...overrides,
  };
}

describe("buildIdentification", () => {
  it("returns the doc's three lists", () => {
    const result = buildIdentification(
      [
        coverage({ brandKey: "nike", brandName: "Nike", brandType: "global" }),
        coverage({ brandKey: "zara", brandName: "Zara", brandType: "global" }),
        coverage({ brandKey: "urban_basics_co", brandName: "Urban Basics Co", brandType: "private" }),
      ],
      [nullRecord({ sku: "SKU-4823" }), nullRecord({ id: "n2", sku: "SKU-5011" })]
    );

    expect(result).toEqual({
      global_brands: ["Nike", "Zara"],
      private_brands: ["Urban Basics Co"],
      null_records: ["SKU-4823", "SKU-5011"],
    });
  });

  it("lists a brand once however many categories carry it", () => {
    // A brand needs one name in the list even though it needs one chart per category.
    const result = buildIdentification(
      [coverage({ sizingCategory: "tops" }), coverage({ id: "c2", sizingCategory: "bottoms" })],
      []
    );

    expect(result.global_brands).toEqual(["Nike"]);
  });

  it("keeps unclassified brands out of both brand lists", () => {
    const result = buildIdentification([coverage({ brandType: "unclassified" })], []);

    expect(result.global_brands).toEqual([]);
    expect(result.private_brands).toEqual([]);
  });

  it("falls back to the platform id when a product carries no SKU", () => {
    const result = buildIdentification([], [nullRecord({ sku: null, externalId: "9912" })]);
    expect(result.null_records).toEqual(["9912"]);
  });
});

describe("buildRouting", () => {
  it("sends only global brands to the web search queue", () => {
    const plan = buildRouting(
      [
        coverage({ brandKey: "nike", brandName: "Nike", brandType: "global", skuCount: 40 }),
        coverage({ id: "c2", brandKey: "house", brandName: "House Label", brandType: "private", skuCount: 12 }),
        coverage({ id: "c3", brandKey: "", brandName: null, brandType: "none", skuCount: 7 }),
      ],
      [nullRecord()]
    );

    expect(plan.webSearch).toEqual({ brands: ["Nike"], charts: 1, skuCount: 40 });
    expect(plan.manualFillBrands).toEqual({ brands: ["House Label"], charts: 1, skuCount: 12 });
    expect(plan.manualFillNulls.brands).toEqual([]);
    expect(plan.manualFillNulls.skuCount).toBe(7);
  });

  it("counts one chart per brand and category, not per brand", () => {
    // A brand carried in five categories is five charts of work; a brand count would hide that.
    const plan = buildRouting(
      [
        coverage({ sizingCategory: "tops", skuCount: 10 }),
        coverage({ id: "c2", sizingCategory: "bottoms", skuCount: 5 }),
      ],
      []
    );

    expect(plan.webSearch).toEqual({ brands: ["Nike"], charts: 2, skuCount: 15 });
  });

  it("groups unbranded rows by category instead of by brand", () => {
    const plan = buildRouting(
      [coverage({ brandKey: "", brandName: null, brandType: "none", skuCount: 3 })],
      [
        nullRecord({ sizingCategory: "tops" }),
        nullRecord({ id: "n2", sizingCategory: "tops" }),
        nullRecord({ id: "n3", sizingCategory: "bottoms" }),
      ]
    );

    expect(plan.manualFillNulls.groups).toEqual([
      { sizingCategory: "tops", label: "Tops", productCount: 2 },
      { sizingCategory: "bottoms", label: "Bottoms", productCount: 1 },
    ]);
  });

  it("holds unclassified brands out of every queue", () => {
    // Routing is deterministic. Defaulting an unclassified brand into a queue costs either a wasted
    // paid search or a merchant hand-typing a chart that already exists.
    const plan = buildRouting([coverage({ brandType: "unclassified" })], []);

    expect(plan.unclassified).toEqual({ brands: ["Nike"], charts: 1, skuCount: 10 });
    expect(plan.webSearch.charts).toBe(0);
    expect(plan.manualFillBrands.charts).toBe(0);
  });

  it("returns empty destinations before a scan has run", () => {
    const plan = buildRouting([], []);

    expect(plan.webSearch.charts).toBe(0);
    expect(plan.manualFillNulls.groups).toEqual([]);
  });
});
