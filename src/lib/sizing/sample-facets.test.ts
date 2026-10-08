import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ db: {} }));

import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";
import { buildSampleFacets, pathFacetsFrom } from "./sample-facets";
import type { SizingFacetRow } from "./record-facets";

function coverage(brandKey: string, brandName: string | null, brandType: SizingCoverageRow["brandType"], skuCount: number) {
  return { brandKey, brandName, brandType, skuCount } as SizingCoverageRow;
}

describe("pathFacetsFrom", () => {
  it("sums leaves into their category and department", () => {
    const paths = pathFacetsFrom({ "women:top:t-shirt": 12, "women:top:knit": 8, "women:bottom:jean": 5, "men:top:shirt": 3 });
    const count = (key: string) => paths.find((p) => p.key === key)?.count;
    expect(count("women:")).toBe(25);
    expect(count("women:top:")).toBe(20);
    expect(count("women:top:t-shirt")).toBe(12);
    expect(count("men:")).toBe(3);
    expect(paths.find((p) => p.key === "women:top:")?.label).toBe("Women > Tops");
    expect(paths.find((p) => p.key === "women:top:t-shirt")?.depth).toBe(3);
  });

  it("ignores malformed keys and empty leaves", () => {
    expect(pathFacetsFrom({ "women:top": 4, "women:top:knit": 0 })).toEqual([]);
  });
});

describe("buildSampleFacets", () => {
  const rows: SizingFacetRow[] = [
    { brandKey: "a", brandLabel: "A", leafKey: "women:top:knit", sizingCategory: "tops", sourceCategoryId: "c2", count: 3 },
    { brandKey: "b", brandLabel: "B", leafKey: "women:top:knit", sizingCategory: "tops", sourceCategoryId: "c2", count: 4 },
    { brandKey: "b", brandLabel: "B", leafKey: "women:top:knit", sizingCategory: "tops", sourceCategoryId: "c1", count: 1 },
  ];
  const categories = [
    { id: "c1", name: "Knit", parentId: "root" },
    { id: "c2", name: "Women top", parentId: "root" },
    { id: "root", name: "Women", parentId: null },
  ];

  it("merges a brand across categories, skips the unbranded row and names collections from the tree", () => {
    const facets = buildSampleFacets({
      coverage: [coverage("a", "A", "global", 5), coverage("a", "A", "global", 7), coverage("", null, "none", 9)],
      leafCounts: { "women:top:knit": 8 },
      facetRows: rows,
      categories,
    });
    expect(facets.brands).toEqual([{ brandKey: "a", name: "A", type: "global", count: 12 }]);
    expect(facets.collections.map((c) => [c.id, c.count, c.trail.join("/")])).toEqual([
      ["c1", 1, "Women/Knit"],
      ["c2", 7, "Women/Women top"],
    ]);
    expect(facets.hasCollections).toBe(true);
  });

  it("reports no collections for a snapshot saved before they were recorded", () => {
    const facets = buildSampleFacets({
      coverage: [],
      leafCounts: {},
      facetRows: [{ ...rows[0], sourceCategoryId: null }],
      categories,
    });
    expect(facets.hasCollections).toBe(false);
    expect(facets.collections).toEqual([]);
  });

  it("copes with the facet read failing", () => {
    const facets = buildSampleFacets({ coverage: [], leafCounts: {}, facetRows: null, categories });
    expect(facets.hasCollections).toBe(false);
  });
});
