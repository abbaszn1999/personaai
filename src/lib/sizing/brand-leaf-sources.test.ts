import { describe, expect, it } from "vitest";
import type { StoreCategory } from "@/modules/store/types";
import { brandLeafSourceLinks, mergeBrandSourceLinks } from "./brand-leaf-sources";
import type { SizingFacetRow } from "./record-facets";

const categories = [
  { id: "root", name: "Women", parentId: null, handle: "women", productCount: 0 },
  { id: "c1", name: "women top s26", parentId: "root", handle: "women-top-s26", productCount: 0 },
  { id: "c2", name: "women basic offers", parentId: "root", handle: "women-basic-offers", productCount: 0 },
] as unknown as StoreCategory[];

function row(overrides: Partial<SizingFacetRow>): SizingFacetRow {
  return {
    brandKey: "moustache_men",
    brandLabel: "MOUSTACHE Men",
    leafKey: "women:top:t-shirt",
    sizingCategory: "tops",
    sourceCategoryId: "c1",
    count: 2,
    ...overrides,
  };
}

const base = {
  categories,
  platform: "shopify" as const,
  storeUrl: "https://shop.example.com",
  source: { kind: "vendor" as const },
  resolveBrandKey: (key: string) => key,
};

describe("brandLeafSourceLinks", () => {
  it("lists only the brand's own collections under the subcategory, each filtered to its spelling", () => {
    const links = brandLeafSourceLinks({
      ...base,
      support: "supported",
      facetRows: [
        row({ sourceCategoryId: "c1", count: 2 }),
        row({ sourceCategoryId: "c2", count: 5 }),
        row({ brandKey: "other", brandLabel: "Other", sourceCategoryId: "c1", count: 9 }),
      ],
    });
    const list = links.moustache_men["women:top:t-shirt"];
    expect(list.map((link) => [link.name, link.count, link.status])).toEqual([
      ["women basic offers", 5, "filtered"],
      ["women top s26", 2, "filtered"],
    ]);
    expect(list[1].url).toBe("https://shop.example.com/collections/women-top-s26?filter.p.vendor=MOUSTACHE%20Men");
    expect(list[1].trail).toEqual(["Women", "women top s26"]);
    expect(links.other["women:top:t-shirt"]).toHaveLength(1);
  });

  it("folds raw spellings into the chart's brand and filters on every one", () => {
    const links = brandLeafSourceLinks({
      ...base,
      support: "supported",
      resolveBrandKey: () => "tom_tailor",
      facetRows: [
        row({ brandKey: "tom_tailor", brandLabel: "Tom Tailor", count: 3 }),
        row({ brandKey: "tom_tailor_denim", brandLabel: "Tom Tailor Denim", count: 4 }),
      ],
    });
    const [entry] = links.tom_tailor["women:top:t-shirt"];
    expect(entry.count).toBe(7);
    expect(entry.url).toContain("filter.p.vendor=Tom%20Tailor&filter.p.vendor=Tom%20Tailor%20Denim");
  });

  it("opens the plain collection, and says so, when the store's filter is off", () => {
    const [entry] = brandLeafSourceLinks({ ...base, support: "unsupported", facetRows: [row({})] }).moustache_men["women:top:t-shirt"];
    expect(entry.status).toBe("whole-collection");
    expect(entry.url).toBe("https://shop.example.com/collections/women-top-s26");
  });

  it("keeps the filter but marks it unchecked when the storefront could not be read", () => {
    const [entry] = brandLeafSourceLinks({ ...base, support: "unreachable", facetRows: [row({})] }).moustache_men["women:top:t-shirt"];
    expect(entry.status).toBe("unchecked");
    expect(entry.url).toContain("filter.p.vendor=");
  });

  it("marks a brand read from a non-filterable field", () => {
    const [entry] = brandLeafSourceLinks({ ...base, source: { kind: "none" }, support: null, facetRows: [row({})] }).moustache_men["women:top:t-shirt"];
    expect(entry.status).toBe("not-filterable");
    expect(entry.url).toBe("https://shop.example.com/collections/women-top-s26");
  });

  it("filters WooCommerce through the Brands taxonomy without needing a probe", () => {
    const [entry] = brandLeafSourceLinks({
      ...base,
      platform: "woocommerce",
      support: null,
      wooBrands: [{ id: 7, name: "MOUSTACHE Men", slug: "moustache-men" }],
      facetRows: [row({})],
    }).moustache_men["women:top:t-shirt"];
    expect(entry.status).toBe("filtered");
    expect(entry.url).toContain("product_brand=moustache-men");
  });

  it("merges the lists of several subcategories into one, adding the counts of a shared collection", () => {
    const links = brandLeafSourceLinks({
      ...base,
      support: "supported",
      facetRows: [
        row({ leafKey: "women:top:t-shirt", sourceCategoryId: "c1", count: 2 }),
        row({ leafKey: "women:top:knit", sourceCategoryId: "c1", count: 3 }),
        row({ leafKey: "women:top:knit", sourceCategoryId: "c2", count: 4 }),
      ],
    }).moustache_men;
    const merged = mergeBrandSourceLinks([links["women:top:t-shirt"], links["women:top:knit"], undefined]);
    expect(merged.map((link) => [link.categoryId, link.count])).toEqual([["c1", 5], ["c2", 4]]);
    expect(links["women:top:t-shirt"][0].count).toBe(2);
  });

  it("drops collections the store no longer has, and rows from before collections were saved", () => {
    const links = brandLeafSourceLinks({
      ...base,
      support: "supported",
      facetRows: [row({ sourceCategoryId: "gone" }), row({ sourceCategoryId: null })],
    });
    expect(links).toEqual({});
  });
});
