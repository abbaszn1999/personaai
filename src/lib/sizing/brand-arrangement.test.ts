import { describe, expect, it } from "vitest";
import { arrangeByBrand, type ArrangedBrandRow } from "./brand-arrangement";
import { UNKNOWN_BRAND_KEY } from "./keys";

const row = (brandKey: string, brandName: string, sizingCategory: string, skuCount: number): ArrangedBrandRow => ({
  brandKey,
  brandName,
  sizingCategory,
  skuCount,
});

const arrange = (rows: ArrangedBrandRow[]) => arrangeByBrand(rows, (value) => value);

describe("arrangeByBrand", () => {
  it("lists one brand's categories together, in taxonomy order, rather than by size across brands", () => {
    const clusters = arrange([
      row("moustache_men", "MOUSTACHE MEN", "tops", 469),
      row("moustache_women", "MOUSTACHE Women", "tops", 395),
      row("moustache_women", "MOUSTACHE Women", "bottoms", 215),
      row("moustache_men", "MOUSTACHE MEN", "footwear", 20),
      row("moustache_men", "MOUSTACHE MEN", "bottoms", 160),
    ]);

    expect(clusters.map((cluster) => cluster.name)).toEqual(["MOUSTACHE MEN", "MOUSTACHE Women"]);
    expect(clusters[0].rows.map((value) => value.sizingCategory)).toEqual(["tops", "bottoms", "footwear"]);
    expect(clusters[0].skuCount).toBe(649);
  });

  it("keeps Men and Women lines of one brand apart but next to each other", () => {
    const clusters = arrange([
      row("moustache_men", "Moustache Men", "tops", 50),
      row("zara_basic", "Zara Basic", "tops", 100),
      row("moustache_women", "Moustache Women", "tops", 60),
    ]);

    expect(clusters.map((cluster) => cluster.key)).toEqual(["moustache_women", "moustache_men", "zara_basic"]);
    expect(clusters.every((cluster) => cluster.brandKeys.length === 1)).toBe(true);
  });

  it("folds spellings that differ only in spacing, punctuation or one typo into one brand", () => {
    const clusters = arrange([
      row("moustache_men", "MOUSTACHE MEN", "tops", 400),
      row("moustachemen", "MoustacheMen", "bottoms", 30),
      row("moustach_men", "Moustach Men", "footwear", 5),
      row("moustache_mens", "Moustache Mens", "dresses", 3),
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].brandKeys).toEqual(["moustache_men", "moustachemen", "moustach_men", "moustache_mens"]);
    expect(clusters[0].otherNames).toEqual(["MoustacheMen", "Moustach Men", "Moustache Mens"]);
    expect(clusters[0].rows.map((value) => value.sizingCategory)).toEqual(["tops", "bottoms", "dresses", "footwear"]);
  });

  it("never treats short names one letter apart as the same brand", () => {
    const clusters = arrange([row("zara", "Zara", "tops", 10), row("zana", "Zana", "tops", 9)]);
    expect(clusters).toHaveLength(2);
  });

  it("keeps the no-brand rows as their own group", () => {
    const clusters = arrange([
      row(UNKNOWN_BRAND_KEY, "No brand", "tops", 10),
      row("no_brand", "No Brand", "tops", 5),
    ]);
    expect(clusters).toHaveLength(2);
  });
});
