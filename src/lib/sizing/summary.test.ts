import { describe, expect, it } from "vitest";
import { labelFor, summarizeCoverage } from "./summary";
import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";

function coverage(overrides: Partial<SizingCoverageRow> = {}): SizingCoverageRow {
  return {
    id: "c1",
    connectionId: "conn",
    brandKey: "nike",
    brandName: "Nike",
    brandType: "global",
    brandCanonicalName: null,
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

describe("summarizeCoverage", () => {
  it("rolls a real brand's rows up into one entry across categories", () => {
    const { brands } = summarizeCoverage([
      coverage({ id: "a", sizingCategory: "tops", skuCount: 10 }),
      coverage({ id: "b", sizingCategory: "bottoms", skuCount: 5 }),
    ]);

    expect(brands).toHaveLength(1);
    expect(brands[0]).toMatchObject({ name: "Nike", skuCount: 15, sizingCategories: ["bottoms", "tops"] });
  });

  // The unbranded sentinel has no brand name to group rows under, so — unlike a real brand — each
  // sizing category it appears in must stay its own row instead of collapsing into one "No brand
  // detected" line that hides which category (and which of the merchant's own category paths) the
  // SKUs actually sit under.
  it("splits the unbranded sentinel into one row per sizing category instead of merging them", () => {
    const { brands, counts } = summarizeCoverage([
      coverage({
        id: "shoes",
        brandKey: "",
        brandName: null,
        brandType: "none",
        sizingCategory: "footwear",
        skuCount: 30,
        storeCategoryPaths: [["Women", "Footwear", "Shoes"]],
      }),
      coverage({
        id: "dresses",
        brandKey: "",
        brandName: null,
        brandType: "none",
        sizingCategory: "dresses",
        skuCount: 5,
        storeCategoryPaths: [["Women", "Dresses"]],
      }),
    ]);

    const nullRows = brands.filter((brand) => brand.brandType === "none");
    expect(nullRows).toHaveLength(2);
    expect(counts.none).toBe(2);

    const footwear = nullRows.find((row) => row.sizingCategories[0] === "footwear");
    expect(footwear).toMatchObject({ name: null, skuCount: 30, storeCategoryPaths: [["Women", "Footwear", "Shoes"]] });

    const dresses = nullRows.find((row) => row.sizingCategories[0] === "dresses");
    expect(dresses).toMatchObject({ name: null, skuCount: 5, storeCategoryPaths: [["Women", "Dresses"]] });

    // Each split row needs a key of its own so the UI never renders two rows under one React key.
    expect(footwear!.brandKey).not.toBe(dresses!.brandKey);
  });

  it("dedupes repeated store category paths on the same unbranded row", () => {
    const { brands } = summarizeCoverage([
      coverage({
        id: "shoes-1",
        brandKey: "",
        brandName: null,
        brandType: "none",
        sizingCategory: "footwear",
        skuCount: 20,
        storeCategoryPaths: [["Women", "Footwear", "Shoes"]],
      }),
      coverage({
        id: "shoes-2",
        brandKey: "",
        brandName: null,
        brandType: "none",
        sizingCategory: "footwear",
        skuCount: 10,
        storeCategoryPaths: [["Women", "Footwear", "Shoes"], ["Women", "Footwear", "Boots"]],
      }),
    ]);

    const footwear = brands.find((brand) => brand.brandType === "none");
    expect(footwear?.skuCount).toBe(30);
    expect(footwear?.storeCategoryPaths).toEqual([
      ["Women", "Footwear", "Shoes"],
      ["Women", "Footwear", "Boots"],
    ]);
  });

  it("leaves real brands' storeCategoryPaths empty — they're identified by name, not shelf location", () => {
    const { brands } = summarizeCoverage([coverage()]);
    expect(brands[0].storeCategoryPaths).toEqual([]);
  });
});

describe("labelFor", () => {
  it("maps a known sizing group to its merchant-facing label", () => {
    expect(labelFor("footwear")).toBe("Footwear");
  });

  it("falls back to the raw key for an unrecognised value", () => {
    expect(labelFor("mystery")).toBe("mystery");
  });
});
