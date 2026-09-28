import { describe, expect, it } from "vitest";
import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";
import { brandSourceFingerprint, type StoreBrandMapping } from "./brand-mapping";
import { buildBrandMappingState } from "./brand-mapping-state";

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
});
