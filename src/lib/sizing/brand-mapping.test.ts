import { describe, expect, it } from "vitest";
import {
  brandSourceFingerprint,
  mappingFromGroups,
  parseStoreBrandMapping,
  privateAliasesFromGroups,
  resolveChartBrandKey,
  resolveChartBrandName,
  resolveMappedBrand,
  suggestBrandMappingGroups,
  type DiscoveredBrand,
} from "./brand-mapping";

const tomTailorBrands: DiscoveredBrand[] = [
  { rawKey: "tom_tailor_men", labels: ["Tom Tailor Men"], skuCount: 4, sizingCategories: ["tops"] },
  { rawKey: "tom_tailor_women", labels: ["Tom Tailor Women"], skuCount: 5, sizingCategories: ["tops"] },
  { rawKey: "tomtailor_women", labels: ["TOMTAILOR WOMEN"], skuCount: 3, sizingCategories: ["bottoms"] },
  { rawKey: "tom_tailor", labels: ["tom tailor"], skuCount: 2, sizingCategories: ["bottoms"] },
];

describe("suggestBrandMappingGroups", () => {
  it("groups audience-qualified and compact spellings only when the base is independently present", () => {
    expect(suggestBrandMappingGroups(tomTailorBrands, [])).toEqual([
      {
        canonicalKey: "tom_tailor",
        canonicalName: "tom tailor",
        rawKeys: ["tom_tailor", "tom_tailor_men", "tom_tailor_women", "tomtailor_women"],
        shared: false,
      },
    ]);
  });

  it("does not strip an audience qualifier without evidence for the base", () => {
    const groups = suggestBrandMappingGroups([tomTailorBrands[0]], []);
    expect(groups[0]).toMatchObject({
      canonicalKey: "tom_tailor_men",
      rawKeys: ["tom_tailor_men"],
    });
  });

  it("uses a shared chart key as evidence for the canonical target", () => {
    const groups = suggestBrandMappingGroups([tomTailorBrands[0]], [
      { canonicalKey: "tom_tailor", canonicalName: "Tom Tailor", shared: true },
    ]);
    expect(groups[0]).toEqual({
      canonicalKey: "tom_tailor",
      canonicalName: "Tom Tailor",
      rawKeys: ["tom_tailor_men"],
      shared: true,
    });
  });
});

describe("store brand mapping", () => {
  it("parses defensively and resolves a raw label to its canonical identity", () => {
    const mapping = parseStoreBrandMapping({
      version: 1,
      confirmedAt: "2026-09-23T20:00:00.000Z",
      sourceFingerprint: "v1-test",
      observed: { "Tom Tailor Men": ["Tom Tailor Men"] },
      aliases: {
        "Tom Tailor Men": {
          canonicalKey: "Tom Tailor",
          canonicalName: "Tom Tailor",
          labels: ["Tom Tailor Men"],
          skuCount: 4,
          sizingCategories: ["tops"],
        },
      },
    });

    expect(resolveMappedBrand("TOM TAILOR MEN", mapping)).toEqual({
      brandKey: "tom_tailor",
      brandName: "Tom Tailor",
    });
  });

  it("does not apply unconfirmed suggestions to chart routing", () => {
    const mapping = parseStoreBrandMapping({
      version: 1,
      confirmedAt: null,
      aliases: {
        "Tom Tailor Men": {
          canonicalKey: "Tom Tailor",
          canonicalName: "Tom Tailor",
          labels: ["Tom Tailor Men"],
        },
      },
    });

    expect(resolveMappedBrand("Tom Tailor Men", mapping)).toEqual({
      brandKey: "tom_tailor_men",
      brandName: "Tom Tailor Men",
    });
  });

  it("requires every discovered global brand exactly once when confirming", () => {
    const current = parseStoreBrandMapping(null);
    expect(() =>
      mappingFromGroups(
        current,
        tomTailorBrands,
        [{ canonicalKey: "tom_tailor", canonicalName: "Tom Tailor", rawKeys: ["tom_tailor"], shared: false }],
        "2026-09-23T20:00:00.000Z",
      ),
    ).toThrow("Every global store brand");
  });

  it("produces a stable fingerprint independent of input order and duplicates", () => {
    expect(brandSourceFingerprint(["Tom Tailor Men", "tom_tailor", "Tom Tailor Men"])).toBe(
      brandSourceFingerprint(["tom_tailor", "tom_tailor_men"]),
    );
  });
});

describe("private brand grouping", () => {
  const houseBrands: DiscoveredBrand[] = [
    { rawKey: "moustache", labels: ["Moustache"], skuCount: 1, sizingCategories: ["bottoms"] },
    { rawKey: "moustache_men", labels: ["Moustache Men"], skuCount: 894, sizingCategories: ["tops"] },
    { rawKey: "moutache_men", labels: ["Moutache Men"], skuCount: 105, sizingCategories: ["tops"] },
  ];
  const group = {
    canonicalKey: "moustache",
    canonicalName: "Moustache",
    rawKeys: ["moustache", "moustache_men", "moutache_men"],
    shared: false,
  };

  it("files a grouped private label's charts under the group, and leaves global routing alone", () => {
    const privateAliases = privateAliasesFromGroups(parseStoreBrandMapping(null), houseBrands, [group], new Set());
    const mapping = parseStoreBrandMapping({ privateAliases });

    expect(resolveChartBrandKey("moutache_men", "private", mapping)).toBe("moustache");
    expect(resolveChartBrandKey("Moustache Men", "private", mapping)).toBe("moustache");
    expect(resolveChartBrandName("moutache_men", "Moutache Men", "private", mapping)).toBe("Moustache");
    expect(resolveChartBrandKey("moutache_men", "global", mapping)).toBe("moutache_men");
    expect(resolveChartBrandKey("other_label", "private", mapping)).toBe("other_label");
  });

  it("refuses a private group named like one of the store's global brands", () => {
    expect(() =>
      privateAliasesFromGroups(parseStoreBrandMapping(null), houseBrands, [group], new Set(["moustache"])),
    ).toThrow("already a global brand");
  });

  it("refuses a label in two groups and a label that is not one of the store's private brands", () => {
    const twice = { ...group, canonicalKey: "house", canonicalName: "House", rawKeys: ["moustache_men"] };
    expect(() =>
      privateAliasesFromGroups(parseStoreBrandMapping(null), houseBrands, [group, twice], new Set()),
    ).toThrow("assigned more than once");
    expect(() =>
      privateAliasesFromGroups(
        parseStoreBrandMapping(null),
        houseBrands,
        [{ ...group, rawKeys: ["tom_tailor"] }],
        new Set(),
      ),
    ).toThrow("Unknown private store brand");
  });

  it("keeps private groups when the global mapping is confirmed again", () => {
    const privateAliases = privateAliasesFromGroups(parseStoreBrandMapping(null), houseBrands, [group], new Set());
    const reconfirmed = mappingFromGroups(
      parseStoreBrandMapping({ privateAliases }),
      [tomTailorBrands[3]],
      [{ canonicalKey: "tom_tailor", canonicalName: "Tom Tailor", rawKeys: ["tom_tailor"], shared: false }],
      "2026-10-07T00:00:00.000Z",
    );

    expect(resolveChartBrandKey("moutache_men", "private", reconfirmed)).toBe("moustache");
  });
});
