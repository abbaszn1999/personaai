import { describe, expect, it } from "vitest";
import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";
import type { SizingRunRow } from "@/lib/db/sizing-runs";
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

function run(stage: SizingRunRow["stage"], status: SizingRunRow["status"]): SizingRunRow {
  return {
    id: "run-1",
    connectionId: "connection-1",
    kind: "setup",
    stage,
    status,
    productsScanned: 10,
    phase: null,
    phaseDone: null,
    phaseTotal: null,
    researchBrandKeys: [],
    researchCurrentBrandKey: null,
    researchForce: false,
    error: null,
    publishedAt: null,
    createdAt: "2026-09-23T20:00:00.000Z",
    updatedAt: "2026-09-23T20:00:00.000Z",
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
  it("keeps Phase 4 blocked while a confirmed mapping is being rescanned", () => {
    const state = buildBrandMappingState({
      coverage: [coverage()],
      mapping,
      sharedBrandKeys: ["tom_tailor"],
      run: run("scan", "running"),
    });
    expect(state.status).toBe("rescanning");
    expect(state.ready).toBe(false);
  });

  it("becomes ready after canonical coverage reaches parked research", () => {
    const state = buildBrandMappingState({
      coverage: [coverage()],
      mapping,
      sharedBrandKeys: ["tom_tailor"],
      run: run("research", "blocked"),
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
      run: run("research", "blocked"),
    });
    expect(state.status).toBe("needs_mapping");
    expect(state.brands.some((brand) => brand.rawKey === "tom_tailor_women")).toBe(true);
  });
});
