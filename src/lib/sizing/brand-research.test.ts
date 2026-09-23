import { describe, expect, it } from "vitest";
import { buildBrandResearch } from "./chart-results";
import type { SizingChartRow } from "@/lib/db/sizing-charts";
import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";

/**
 * Stage 4's brand queue.
 *
 * The grain is the thing worth pinning down. Coverage is per (brand x sizing parent) but one web
 * search reads a brand's whole guide, so the screen and the button both work per brand — and a status
 * derived from a single coverage row would call a brand "charted" while three of its four parents had
 * nothing.
 */
function coverage(overrides: Partial<SizingCoverageRow> = {}): SizingCoverageRow {
  return {
    id: "cov-1",
    connectionId: "conn-1",
    brandKey: "nike",
    brandName: "Nike",
    brandType: "global",
    brandCanonicalName: null,
    sizingCategory: "tops",
    skuCount: 10,
    storeCategoryPaths: [["Clothing"]],
    sampleSkus: [],
    rawFormats: {},
    audienceHints: {},
    researchStatus: "pending",
    researchNote: null,
    updatedAt: "2026-09-04T00:00:00Z",
    ...overrides,
  };
}

function chart(overrides: Partial<SizingChartRow> = {}): SizingChartRow {
  return {
    id: "chart-1",
    connectionId: null,
    brandKey: "nike",
    sizingCategory: "tops",
    variantName: "Men",
    coversLeaves: [],
    audience: "mens",
    sourceTitle: "Men's Tops",
    chartRows: [{ size: "M", chest_min: 96, chest_max: 104 }],
    confidence: 0.95,
    sourceUrl: "https://nike.example/size-guide",
    provenance: "research",
    version: 1,
    updatedAt: "2026-09-04T09:33:39.000Z",
    ...overrides,
  };
}

describe("buildBrandResearch", () => {
  it("collapses a brand's coverage rows into one row summing its stock", () => {
    const rows = buildBrandResearch(
      [
        coverage({ id: "a", sizingCategory: "tops", skuCount: 40 }),
        coverage({ id: "b", sizingCategory: "bottoms", skuCount: 15 }),
      ],
      []
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].skuCount).toBe(55);
    expect(rows[0].sizingCategories).toEqual(["bottoms", "tops"]);
    expect(rows[0].status).toBe("pending");
  });

  it("is only done once every parent the store carries has a chart", () => {
    const both = [
      coverage({ id: "a", sizingCategory: "tops" }),
      coverage({ id: "b", sizingCategory: "bottoms" }),
    ];

    const partial = buildBrandResearch(both, [chart({ sizingCategory: "tops" })]);
    expect(partial[0].status).toBe("partial");
    expect(partial[0].chartedCategories).toBe(1);

    const done = buildBrandResearch(both, [
      chart({ id: "c1", sizingCategory: "tops" }),
      chart({ id: "c2", sizingCategory: "bottoms" }),
    ]);
    expect(done[0].status).toBe("done");
  });

  it("counts every published table, not one per parent", () => {
    // A brand publishing a men's and a women's tops table covers one parent with two charts. Reporting
    // that as two covered parents would show a store carrying only tops as over-covered.
    const rows = buildBrandResearch([coverage()], [
      chart({ id: "c1", variantName: "Men" }),
      chart({ id: "c2", variantName: "Women", audience: "womens" }),
    ]);

    expect(rows[0].chartCount).toBe(2);
    expect(rows[0].chartedCategories).toBe(1);
    expect(rows[0].status).toBe("done");
  });

  it("separates a brand nothing has looked at from one that was searched and came back empty", () => {
    expect(buildBrandResearch([coverage({ researchStatus: "pending" })], [])[0].status).toBe("pending");
    expect(buildBrandResearch([coverage({ researchStatus: "not_found" })], [])[0].status).toBe("not_found");
    expect(buildBrandResearch([coverage({ researchStatus: "not_covered" })], [])[0].status).toBe("not_found");
  });

  it("reports a broken call as failed, since that wants a retry rather than a hand-filled chart", () => {
    const rows = buildBrandResearch(
      [
        coverage({ id: "a", sizingCategory: "tops", researchStatus: "not_found" }),
        coverage({ id: "b", sizingCategory: "bottoms", researchStatus: "failed" }),
      ],
      []
    );

    expect(rows[0].status).toBe("failed");
  });

  it("shows the live scope, and lets it outrank stored charts", () => {
    // A brand being regenerated still holds last pass's charts. Reading those first would show it as
    // Charted while a search was running, making the button look like it had done nothing.
    const done = [coverage()];
    const charts = [chart()];

    expect(buildBrandResearch(done, charts, { scopedBrandKeys: ["nike"] })[0].status).toBe("queued");
    expect(buildBrandResearch(done, charts, { currentBrandKey: "nike" })[0].status).toBe("researching");
    // Both set is the normal in-flight state, since the scope still lists the brand being worked on.
    expect(
      buildBrandResearch(done, charts, { scopedBrandKeys: ["nike"], currentBrandKey: "nike" })[0].status
    ).toBe("researching");
  });

  it("leaves out every brand a web search cannot help", () => {
    const rows = buildBrandResearch(
      [
        coverage({ id: "a", brandKey: "nike" }),
        coverage({ id: "b", brandKey: "house_label", brandName: "House Label", brandType: "private" }),
        coverage({ id: "c", brandKey: "", brandName: null, brandType: "none" }),
        coverage({ id: "d", brandKey: "maybe", brandName: "Maybe", brandType: "unclassified" }),
      ],
      []
    );

    expect(rows.map((row) => row.brandKey)).toEqual(["nike"]);
  });

  it("names what the search will actually run on when the store's spelling differs", () => {
    const rows = buildBrandResearch(
      [coverage({ brandName: "CLAUDIE", brandCanonicalName: "Claudie Pierlot" })],
      []
    );

    expect(rows[0].brandName).toBe("CLAUDIE");
    expect(rows[0].searchName).toBe("Claudie Pierlot");
  });

  it("leads with the brands carrying the most stock", () => {
    const rows = buildBrandResearch(
      [
        coverage({ id: "a", brandKey: "small", brandName: "Small", skuCount: 5 }),
        coverage({ id: "b", brandKey: "big", brandName: "Big", skuCount: 500 }),
      ],
      []
    );

    expect(rows.map((row) => row.brandKey)).toEqual(["big", "small"]);
  });
});
