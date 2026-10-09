import { describe, expect, it } from "vitest";
import {
  brandLeafSourcesFromFacets,
  facetsHaveSources,
  leafSourceCategoryIds,
  sourceCountsFromFacets,
  type SizingFacetRow,
} from "./record-facets";

function row(overrides: Partial<SizingFacetRow>): SizingFacetRow {
  return {
    brandKey: "moustache_men",
    brandLabel: "MOUSTACHE Men",
    leafKey: "women:top:t_shirt",
    sizingCategory: "tops",
    sourceCategoryId: "c1",
    count: 1,
    ...overrides,
  };
}

describe("leafSourceCategoryIds", () => {
  it("collects every collection mapped to the primary subcategory, once each", () => {
    const ids = leafSourceCategoryIds(
      [
        { key: "women:top:t_shirt", sourceCategoryId: "a" },
        { key: "women:top:t_shirt", sourceCategoryId: "b" },
        { key: "women:top:t_shirt", sourceCategoryId: "a" },
        { key: "women:bottom:jean", sourceCategoryId: "c" },
      ],
      "women:top:t_shirt",
    );
    expect(ids).toEqual(["a", "b"]);
  });

  it("is empty without a primary leaf or a recorded collection", () => {
    expect(leafSourceCategoryIds([{ key: "x", sourceCategoryId: "a" }], null)).toEqual([]);
    expect(leafSourceCategoryIds([{ key: "x" }], "x")).toEqual([]);
  });
});

describe("brandLeafSourcesFromFacets", () => {
  it("lists only the collections that hold the brand's items under the subcategory, busiest first", () => {
    const sources = brandLeafSourcesFromFacets([
      row({ sourceCategoryId: "c1", count: 2 }),
      row({ sourceCategoryId: "c2", count: 9 }),
      row({ brandKey: "tom_tailor", brandLabel: "Tom Tailor", sourceCategoryId: "c3", count: 5 }),
      row({ leafKey: "women:bottom:jean", sourceCategoryId: "c4", count: 1 }),
    ]);
    expect(sources.moustache_men["women:top:t_shirt"].map((s) => [s.categoryId, s.count])).toEqual([
      ["c2", 9],
      ["c1", 2],
    ]);
    expect(sources.moustache_men["women:bottom:jean"]).toHaveLength(1);
    expect(sources.tom_tailor["women:top:t_shirt"]).toHaveLength(1);
  });

  it("keeps every spelling of a brand present in a collection", () => {
    const sources = brandLeafSourcesFromFacets([
      row({ brandLabel: "MOUSTACHE Men", count: 3 }),
      row({ brandLabel: "Moustache men", count: 1 }),
    ]);
    const [entry] = sources.moustache_men["women:top:t_shirt"];
    expect(entry.count).toBe(4);
    expect(entry.labels).toEqual(["MOUSTACHE Men", "Moustache men"]);
  });

  it("ignores rows saved before collections existed", () => {
    expect(brandLeafSourcesFromFacets([row({ sourceCategoryId: null })])).toEqual({});
  });
});

describe("collection counts", () => {
  it("counts products per collection and reports whether any collection was saved", () => {
    const rows = [row({ sourceCategoryId: "c1", count: 2 }), row({ brandKey: "x", sourceCategoryId: "c1", count: 3 })];
    expect(sourceCountsFromFacets(rows)).toEqual([{ key: "c1", count: 5 }]);
    expect(facetsHaveSources(rows)).toBe(true);
    expect(facetsHaveSources([row({ sourceCategoryId: null })])).toBe(false);
  });
});
