import { describe, expect, it } from "vitest";
import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";
import { parseStoreBrandMapping } from "./brand-mapping";
import { canonicalizeCoverageForCharts } from "./brand-mapping-view";

function coverage(brandKey: string, brandName: string, skuCount: number): SizingCoverageRow {
  return {
    id: `coverage-${brandKey}`,
    connectionId: "connection-1",
    brandKey,
    brandName,
    brandType: "global",
    brandCanonicalName: null,
    sizingCategory: "tops",
    skuCount,
    storeCategoryPaths: [["Women", "Tops"]],
    sampleSkus: [],
    rawFormats: {},
    audienceHints: {},
    researchStatus: "pending",
    researchNote: null,
    updatedAt: "2026-09-24T00:00:00.000Z",
  };
}

const mapping = parseStoreBrandMapping({
  version: 1,
  confirmedAt: "2026-09-24T00:00:00.000Z",
  sourceFingerprint: "v1-test",
  observed: {
    tom_tailor_women: ["Tom Tailor Women"],
    tomtailor_women: ["TOMTAILOR WOMEN"],
  },
  aliases: {
    tom_tailor_women: {
      canonicalKey: "tom_tailor",
      canonicalName: "Tom Tailor",
      labels: ["Tom Tailor Women"],
      skuCount: 3,
      sizingCategories: ["tops"],
    },
    tomtailor_women: {
      canonicalKey: "tom_tailor",
      canonicalName: "Tom Tailor",
      labels: ["TOMTAILOR WOMEN"],
      skuCount: 2,
      sizingCategories: ["tops"],
    },
  },
});

describe("canonical Phase 4 view", () => {
  it("groups aliases for display without mutating coverage", () => {
    const source = [
      coverage("tom_tailor_women", "Tom Tailor Women", 3),
      coverage("tomtailor_women", "TOMTAILOR WOMEN", 2),
    ];
    const before = structuredClone(source);

    const view = canonicalizeCoverageForCharts(source, mapping);

    expect(source).toEqual(before);
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]).toMatchObject({
      brandKey: "tom_tailor",
      brandName: "Tom Tailor",
      skuCount: 5,
    });
    expect(view.membersByCanonicalKey.get("tom_tailor")).toEqual([
      { brandKey: "tom_tailor_women", brandName: "Tom Tailor Women", skuCount: 3 },
      { brandKey: "tomtailor_women", brandName: "TOMTAILOR WOMEN", skuCount: 2 },
    ]);
  });

  it("groups private labels through the store's own grouping and lists their members", () => {
    const alias = (canonicalName: string) => ({
      canonicalKey: "moustache",
      canonicalName,
      labels: [],
      skuCount: 0,
      sizingCategories: ["tops"],
    });
    const withPrivate = parseStoreBrandMapping({
      ...mapping,
      privateAliases: { moustache_men: alias("Moustache"), moutache_men: alias("Moustache") },
    });
    const source = [
      { ...coverage("moustache_men", "Moustache Men", 7), brandType: "private" as const },
      { ...coverage("moutache_men", "Moutache Men", 2), brandType: "private" as const },
      { ...coverage("moustache_suit", "Moustache Suit", 1), brandType: "private" as const },
    ];

    const view = canonicalizeCoverageForCharts(source, withPrivate);

    expect(view.rows.map((row) => [row.brandKey, row.brandName, row.skuCount])).toEqual([
      ["moustache", "Moustache", 9],
      ["moustache_suit", "Moustache Suit", 1],
    ]);
    expect(view.membersByCanonicalKey.get("moustache")?.map((member) => member.brandKey))
      .toEqual(["moustache_men", "moutache_men"]);
  });

  it("never merges a private label into a global brand that shares its key", () => {
    const clash = parseStoreBrandMapping({
      ...mapping,
      privateAliases: {
        house: { canonicalKey: "tom_tailor", canonicalName: "Tom Tailor", labels: [], skuCount: 0, sizingCategories: [] },
      },
    });
    const view = canonicalizeCoverageForCharts(
      [coverage("tom_tailor_women", "Tom Tailor Women", 3), { ...coverage("house", "House", 4), brandType: "private" }],
      clash,
    );

    expect(view.rows).toHaveLength(2);
  });
});
