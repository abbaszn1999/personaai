import { describe, expect, it } from "vitest";
import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";
import { brandSourceFingerprint, mappingWithNewBrandGroups, type StoreBrandMapping } from "./brand-mapping";
import { buildBrandMappingState, buildNewBrandMappingState } from "./brand-mapping-state";

function coverage(overrides: Partial<SizingCoverageRow> = {}): SizingCoverageRow {
  return {
    id: "coverage-1",
    connectionId: "connection-1",
    brandKey: "tom_tailor",
    brandName: "Tom Tailor",
    brandType: "global",
    brandCanonicalName: "Tom Tailor",
    sizingCategory: "tops",
    skuCount: 10,
    storeCategoryPaths: [],
    sampleSkus: [],
    rawFormats: {},
    audienceHints: {},
    researchStatus: "pending",
    researchNote: null,
    updatedAt: "2026-09-23T20:00:00.000Z",
    ...overrides,
  };
}

const mapping: StoreBrandMapping = {
  version: 1,
  confirmedAt: "2026-09-23T20:00:00.000Z",
  sourceFingerprint: brandSourceFingerprint(["tom_tailor", "tom_tailor_men"]),
  observed: {
    tom_tailor: ["Tom Tailor"],
    tom_tailor_men: ["Tom Tailor Men"],
  },
  aliases: {
    tom_tailor: {
      canonicalKey: "tom_tailor",
      canonicalName: "Tom Tailor",
      labels: ["Tom Tailor"],
      skuCount: 6,
      sizingCategories: ["tops"],
    },
    tom_tailor_men: {
      canonicalKey: "tom_tailor",
      canonicalName: "Tom Tailor",
      labels: ["Tom Tailor Men"],
      skuCount: 4,
      sizingCategories: ["tops"],
    },
  },
  privateAliases: {},
};

describe("buildBrandMappingState", () => {
  it("becomes ready immediately after the complete mapping is confirmed", () => {
    const state = buildBrandMappingState({
      coverage: [
        coverage(),
        coverage({
          id: "coverage-2",
          brandKey: "tom_tailor_men",
          brandName: "Tom Tailor Men",
          skuCount: 4,
        }),
      ],
      mapping,
      sharedBrandKeys: ["tom_tailor"],
    });
    expect(state.status).toBe("ready");
    expect(state.brands.map((brand) => brand.rawKey)).toEqual(["tom_tailor", "tom_tailor_men"]);
  });

  it("reopens mapping when a new global raw label appears", () => {
    const state = buildBrandMappingState({
      coverage: [
        coverage(),
        coverage({
          id: "coverage-2",
          brandKey: "tom_tailor_women",
          brandName: "Tom Tailor Women",
          skuCount: 2,
        }),
      ],
      mapping,
      sharedBrandKeys: ["tom_tailor"],
    });
    expect(state.status).toBe("needs_mapping");
    expect(state.brands.some((brand) => brand.rawKey === "tom_tailor_women")).toBe(true);
  });

  it("suggests grouping the store's own audience labels without making them block readiness", () => {
    const house = (brandKey: string, brandName: string, skuCount: number) =>
      coverage({ id: `coverage-${brandKey}`, brandKey, brandName, brandType: "private", brandCanonicalName: null, skuCount });
    const state = buildBrandMappingState({
      coverage: [
        coverage(),
        coverage({ id: "coverage-2", brandKey: "tom_tailor_men", brandName: "Tom Tailor Men", skuCount: 4 }),
        house("moustache", "Moustache", 1),
        house("moustache_men", "Moustache Men", 894),
        house("moustache_women", "Moustache Women", 995),
        house("moustache_suit", "Moustache Suit", 14),
      ],
      mapping,
      sharedBrandKeys: ["tom_tailor"],
    });

    expect(state.status).toBe("ready");
    expect(state.privateBrands.map((brand) => brand.rawKey)).toEqual([
      "moustache",
      "moustache_men",
      "moustache_suit",
      "moustache_women",
    ]);
    expect(state.privateGroups.map((group) => [group.canonicalKey, group.rawKeys])).toEqual([
      ["moustache", ["moustache", "moustache_men", "moustache_women"]],
      ["moustache_suit", ["moustache_suit"]],
    ]);
  });
});

describe("buildNewBrandMappingState (Sync)", () => {
  const stocked = [
    coverage(),
    coverage({ id: "coverage-2", brandKey: "tom_tailor_men", brandName: "Tom Tailor Men", skuCount: 4 }),
  ];
  const house = (brandKey: string, brandName: string) =>
    coverage({ id: `coverage-${brandKey}`, brandKey, brandName, brandType: "private", brandCanonicalName: null, skuCount: 3 });

  it("lists only the global brands no confirmed alias covers", () => {
    const state = buildNewBrandMappingState({
      coverage: [...stocked, coverage({ id: "coverage-3", brandKey: "salomon", brandName: "Salomon", skuCount: 2 })],
      mapping,
      sharedBrandKeys: ["tom_tailor", "salomon"],
      runBrandKeys: new Set(["salomon"]),
    });
    expect(state.status).toBe("needs_mapping");
    expect(state.brands.map((brand) => brand.rawKey)).toEqual(["salomon"]);
    expect(state.groups.flatMap((group) => group.rawKeys)).toEqual(["salomon"]);
  });

  it("lists only the sync's own private labels nobody grouped", () => {
    const state = buildNewBrandMappingState({
      coverage: [...stocked, house("moustache", "Moustache"), house("moustache_kids", "Moustache Kids")],
      mapping: {
        ...mapping,
        privateAliases: {
          moustache: { canonicalKey: "moustache", canonicalName: "Moustache", labels: ["Moustache"], skuCount: 3, sizingCategories: ["tops"] },
        },
      },
      sharedBrandKeys: ["tom_tailor"],
      runBrandKeys: new Set(["moustache_kids"]),
    });
    expect(state.status).toBe("ready");
    expect(state.privateBrands.map((brand) => brand.rawKey)).toEqual(["moustache_kids"]);
    // The label can join the group the merchant already made.
    expect(state.privateGroups.map((group) => group.canonicalKey)).toEqual(["moustache"]);
  });

  it("is ready once the new brands are grouped, keeping every alias Setup confirmed", () => {
    const withNew = [...stocked, coverage({ id: "coverage-3", brandKey: "salomon", brandName: "Salomon", skuCount: 2 })];
    const before = buildBrandMappingState({ coverage: withNew, mapping, sharedBrandKeys: ["tom_tailor", "salomon"] });
    const sync = buildNewBrandMappingState({
      coverage: withNew,
      mapping,
      sharedBrandKeys: ["tom_tailor", "salomon"],
      runBrandKeys: new Set(["salomon"]),
    });

    const merged = mappingWithNewBrandGroups(
      mapping,
      before.brands,
      sync.brands,
      [{ canonicalKey: "salomon", canonicalName: "Salomon", rawKeys: ["salomon"], shared: true }],
      "2026-10-22T00:00:00.000Z",
    );

    expect(Object.keys(merged.aliases).sort()).toEqual(["salomon", "tom_tailor", "tom_tailor_men"]);
    expect(merged.aliases.tom_tailor_men.canonicalKey).toBe("tom_tailor");
    const after = buildBrandMappingState({ coverage: withNew, mapping: merged, sharedBrandKeys: ["tom_tailor", "salomon"] });
    expect(after.status).toBe("ready");
  });

  it("refuses a save that leaves a new brand ungrouped", () => {
    const withNew = [...stocked, coverage({ id: "coverage-3", brandKey: "salomon", brandName: "Salomon", skuCount: 2 })];
    const all = buildBrandMappingState({ coverage: withNew, mapping, sharedBrandKeys: [] }).brands;
    const fresh = all.filter((brand) => brand.rawKey === "salomon");
    expect(() => mappingWithNewBrandGroups(mapping, all, fresh, [], "2026-10-22T00:00:00.000Z")).toThrow();
  });
});
