import { describe, expect, it } from "vitest";
import { CoverageAggregator, toRawFormat, type ScanProduct } from "./aggregate";

function product(overrides: Partial<ScanProduct> = {}): ScanProduct {
  return {
    externalId: "p1",
    sku: "SKU-1",
    title: "Relaxed Fit Linen Shirt",
    brand: "Aria",
    sizingGroup: "tops",
    sizes: ["S", "M", "L"],
    genders: ["Male"],
    ageGroups: [],
    storeCategoryPaths: [["Men", "Shirts"]],
    imageUrl: "https://cdn.example.com/shirt.webp",
    ...overrides,
  };
}

describe("CoverageAggregator", () => {
  it("folds a product into one (brand x sizing category) row", () => {
    const aggregator = new CoverageAggregator();
    aggregator.add(product());

    const rows = aggregator.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      brandKey: "aria",
      brandName: "Aria",
      sizingCategory: "tops",
      skuCount: 1,
      rawFormats: { "S,M,L": { count: 1, canonical: null } },
    });
  });

  // The doc's `null_records`: the one list that has to be row-level, because an unbranded product
  // has no name to group under.
  describe("null records", () => {
    it("lists a sized product the agent could not brand", () => {
      const aggregator = new CoverageAggregator();
      aggregator.add(product({ brand: null }));

      expect(aggregator.nullRecords()).toEqual([
        { externalId: "p1", sku: "SKU-1", title: "Relaxed Fit Linen Shirt", sizingCategory: "tops" },
      ]);
      expect(aggregator.stats().unbranded).toBe(1);
    });

    it("leaves branded products off the list", () => {
      const aggregator = new CoverageAggregator();
      aggregator.add(product());

      expect(aggregator.nullRecords()).toEqual([]);
      expect(aggregator.stats().unbranded).toBe(0);
    });

    it("skips products with no sizing category at all", () => {
      // A scarf has no chart to fill in, so listing it as an unresolved gap would ask the merchant
      // for something that cannot exist.
      const aggregator = new CoverageAggregator();
      aggregator.add(product({ brand: null, sizingGroup: null, sizes: [] }));

      expect(aggregator.nullRecords()).toEqual([]);
    });

    it("lists a product filed in two categories only once", () => {
      const aggregator = new CoverageAggregator();
      aggregator.add(product({ brand: null }));
      aggregator.add(product({ brand: null, storeCategoryPaths: [["Men", "Linen"]] }));

      expect(aggregator.nullRecords()).toHaveLength(1);
      expect(aggregator.stats().unbranded).toBe(1);
    });

    it("groups nulls under their own sizing category", () => {
      const aggregator = new CoverageAggregator();
      aggregator.add(product({ externalId: "a", brand: null }));
      aggregator.add(product({ externalId: "b", brand: null, sizingGroup: "bottoms" }));

      expect(aggregator.nullRecords().map((record) => record.sizingCategory)).toEqual(["tops", "bottoms"]);
    });

    it("reports an untruncated list as untruncated", () => {
      const aggregator = new CoverageAggregator();
      aggregator.add(product({ brand: null }));

      expect(aggregator.stats().nullRecordsTruncated).toBe(false);
    });
  });

  it("keeps men's and women's stock in one row but records the split as a hint", () => {
    // The key used to carry the audience, so this produced two rows. It cannot: on a catalog with no
    // gender field every row falls to `unisex` and the key asserts something nobody knows. The
    // audience now belongs to the chart, read off the brand's own guide. What the catalog saw is
    // still worth keeping, so it is counted here and used only to break ties at chart selection.
    const aggregator = new CoverageAggregator();
    aggregator.add(product({ externalId: "m1", genders: ["Male"] }));
    aggregator.add(product({ externalId: "w1", genders: ["Female"], storeCategoryPaths: [["Women", "Shirts"]] }));

    const rows = aggregator.rows();
    expect(rows.map((row) => row.sizingCategory)).toEqual(["tops"]);
    expect(rows[0].audienceHints).toEqual({ mens: 1, womens: 1 });
  });

  it("folds brand spellings that differ only in case, spacing or accents into one row", () => {
    const aggregator = new CoverageAggregator();
    aggregator.add(product({ externalId: "a", brand: "Hermès" }));
    aggregator.add(product({ externalId: "b", brand: "hermes " }));

    const rows = aggregator.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0].brandKey).toBe("hermes");
    expect(rows[0].skuCount).toBe(2);
    // First spelling seen wins, so the display name doesn't flicker between runs.
    expect(rows[0].brandName).toBe("Hermès");
  });

  it("counts a product once but merges its categories when it appears in several collections", () => {
    // Overlapping collections are the norm — a shirt in both "Men" and "Sale". Counting each
    // sighting would inflate every SKU total the merchant is shown and every cost estimate from it.
    const aggregator = new CoverageAggregator();
    aggregator.add(product({ storeCategoryPaths: [["Men", "Shirts"]] }));
    aggregator.add(product({ storeCategoryPaths: [["Sale"]] }));

    const rows = aggregator.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0].skuCount).toBe(1);
    expect(rows[0].storeCategoryPaths).toEqual([["Men", "Shirts"], ["Sale"]]);
    expect(aggregator.stats()).toMatchObject({ seen: 2, counted: 1 });
  });

  it("does not double count a raw size format when a product is seen twice", () => {
    const aggregator = new CoverageAggregator();
    aggregator.add(product());
    aggregator.add(product({ storeCategoryPaths: [["Sale"]] }));

    expect(aggregator.rows()[0].rawFormats["S,M,L"].count).toBe(1);
  });

  it("skips a product the merchant's mapping does not reach rather than filing it under a default", () => {
    // A scarf sits in a path the merchant left unmapped, because there is no chart for it to have.
    // Filing it anywhere would generate a research request that could only come back empty, and a
    // gap template nobody can fill.
    const aggregator = new CoverageAggregator();
    aggregator.add(product({ externalId: "scarf", sizingGroup: null }));

    expect(aggregator.rows()).toHaveLength(0);
    expect(aggregator.stats()).toMatchObject({ counted: 1, unsized: 1 });
  });

  it("files a product on the parent the merchant chose, whatever the product is called", () => {
    // The title says nothing here and is not supposed to: a swim brief is Bottoms because the
    // merchant mapped `Swimwear > Mens` to Bottoms, not because anything matched the word "brief".
    const aggregator = new CoverageAggregator();
    aggregator.add(product({ externalId: "swim", title: "Signature Swim Brief", sizingGroup: "bottoms" }));

    expect(aggregator.rows()[0]).toMatchObject({ sizingCategory: "bottoms", skuCount: 1 });
  });

  it("files unbranded stock under the sentinel rather than dropping it", () => {
    const aggregator = new CoverageAggregator();
    aggregator.add(product({ brand: null }));

    const rows = aggregator.rows();
    expect(rows[0].brandKey).toBe("");
    expect(rows[0].brandName).toBeNull();
  });

  it("records a sized product with no sizes without inventing a format for it", () => {
    const aggregator = new CoverageAggregator();
    aggregator.add(product({ sizes: [] }));

    const rows = aggregator.rows();
    expect(rows[0].skuCount).toBe(1);
    expect(rows[0].rawFormats).toEqual({});
    expect(aggregator.stats().sizeless).toBe(1);
  });

  it("caps samples at three and keeps the first ones seen", () => {
    const aggregator = new CoverageAggregator();
    for (let i = 0; i < 10; i++) aggregator.add(product({ externalId: `p${i}`, sku: `SKU-${i}` }));

    const samples = aggregator.rows()[0].sampleSkus;
    expect(samples).toHaveLength(3);
    expect(samples.map((s) => s.sku)).toEqual(["SKU-0", "SKU-1", "SKU-2"]);
  });

  it("orders rows by stock so the largest coverage is first", () => {
    const aggregator = new CoverageAggregator();
    aggregator.add(product({ externalId: "a", brand: "Small" }));
    for (let i = 0; i < 5; i++) aggregator.add(product({ externalId: `b${i}`, brand: "Big" }));

    expect(aggregator.rows().map((row) => row.brandKey)).toEqual(["big", "small"]);
  });

  it("reports the raw-format cap being hit instead of silently trimming", () => {
    const aggregator = new CoverageAggregator();
    // 401 distinct formats against a 400 cap.
    for (let i = 0; i < 401; i++) {
      aggregator.add(product({ externalId: `p${i}`, sizes: [`SIZE-${i}`] }));
    }

    expect(Object.keys(aggregator.rows()[0].rawFormats)).toHaveLength(400);
    expect(aggregator.stats().truncatedFormatRows).toBe(1);
  });

  it("orders raw formats by how much stock they cover", () => {
    const aggregator = new CoverageAggregator();
    aggregator.add(product({ externalId: "rare", sizes: ["XS"] }));
    for (let i = 0; i < 3; i++) aggregator.add(product({ externalId: `common${i}`, sizes: ["S", "M"] }));

    expect(Object.keys(aggregator.rows()[0].rawFormats)).toEqual(["S,M", "XS"]);
  });

  it("falls back to category names and the title when the store records no gender", () => {
    const aggregator = new CoverageAggregator();
    aggregator.add(
      product({ genders: [], ageGroups: [], storeCategoryPaths: [["Women", "Blouses"]], title: "Silk Blouse" })
    );

    expect(aggregator.rows()[0].audienceHints).toEqual({ womens: 1 });
  });

  it("records stock with no audience signal at all as unisex rather than dropping it", () => {
    // This is the store the refit was built against: one flat category, no gender field, nothing in
    // the title. Every product lands here, which is exactly why the key could not carry an audience.
    const aggregator = new CoverageAggregator();
    aggregator.add(product({ genders: [], ageGroups: [], storeCategoryPaths: [["New In"]], title: "Linen Shirt" }));

    expect(aggregator.rows()[0].sizingCategory).toBe("tops");
    expect(aggregator.rows()[0].audienceHints).toEqual({ unisex: 1 });
  });
});

describe("toRawFormat", () => {
  it("normalizes case and spacing so one format isn't counted as several", () => {
    expect(toRawFormat([" s ", "M", "l"])).toBe("S,M,L");
  });

  it("preserves the merchant's order, which carries the scale's direction", () => {
    expect(toRawFormat(["L", "M", "S"])).toBe("L,M,S");
  });

  it("drops duplicates within one product's size list", () => {
    expect(toRawFormat(["S", "s", "M"])).toBe("S,M");
  });

  it("returns null for a product with no usable size labels", () => {
    expect(toRawFormat([])).toBeNull();
    expect(toRawFormat(["", "  "])).toBeNull();
  });

  it("keeps a span like XS-S as the single label the merchant wrote", () => {
    // Splitting it would invent stock: the garment is one item covering two sizes, not two items.
    expect(toRawFormat(["XS-S", "M-L"])).toBe("XS-S,M-L");
  });
});
