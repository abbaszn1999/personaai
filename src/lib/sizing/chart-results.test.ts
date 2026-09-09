import { describe, expect, it } from "vitest";
import { buildChartResults } from "./chart-results";
import type { SizingChartRow } from "@/lib/db/sizing-charts";
import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";

/**
 * The join Stage 4 renders. What matters here is that coverage drives it: every (brand x sizing
 * category) the store carries has to come back as either a chart or a gap, because the review
 * screen's whole purpose is accounting for the ones with nothing behind them. A version that
 * iterated charts would have shown the first real run as 8 quiet successes instead of 8 successes
 * and 45 gaps.
 */
function coverage(overrides: Partial<SizingCoverageRow> = {}): SizingCoverageRow {
  return {
    id: "cov-1",
    connectionId: "conn-1",
    brandKey: "nike",
    brandName: "Nike",
    brandType: "global",
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
    variantGender: "mens",
    variantFitType: null,
    audience: "mens",
    sourceTitle: "Men's Tops",
    region: "EU",
    chartRows: [
      { size: "S", chest_min: 88, chest_max: 96 },
      { size: "M", chest_min: 96, chest_max: 104 },
    ],
    confidence: 0.95,
    sourceUrl: "https://nike.example/size-guide",
    provenance: "research",
    version: 1,
    updatedAt: "2026-09-04T09:33:39.000Z",
    ...overrides,
  };
}

describe("buildChartResults", () => {
  it("renders a charted pair with its display table and store SKU count", () => {
    const result = buildChartResults([coverage({ skuCount: 79 })], [chart()]);

    expect(result.charts).toHaveLength(1);
    const [row] = result.charts;
    expect(row.brand).toBe("Nike");
    expect(row.sizingCategory).toBe("tops");
    expect(row.audience).toBe("mens");
    expect(row.sourceTitle).toBe("Men's Tops");
    // The count comes from coverage, not the chart: it is how many of *this store's* items the chart
    // covers, which is the number the merchant is deciding about.
    expect(row.skuCount).toBe(79);
    expect(row.confidence).toBe(95);
    expect(row.headers).toEqual(["Size", "Chest (cm)"]);
    expect(row.shared).toBe(true);
  });

  it("turns an uncharted pair into a gap carrying research's reason", () => {
    const result = buildChartResults(
      [coverage({ researchStatus: "not_found", researchNote: "No official size guide could be found." })],
      []
    );

    expect(result.charts).toHaveLength(0);
    expect(result.notFound).toHaveLength(1);
    expect(result.notFound[0].reason).toBe("No official size guide found for this brand");
    expect(result.notFound[0].researchNote).toBe("No official size guide could be found.");
  });

  it("distinguishes a guide that skipped the category from one that was never found", () => {
    const result = buildChartResults([coverage({ researchStatus: "not_covered" })], []);
    expect(result.notFound[0].reason).toBe("Guide found, but it does not cover this category");
  });

  it("marks a failure as retryable rather than as a gap to hand-fill", () => {
    const result = buildChartResults([coverage({ researchStatus: "failed" })], []);
    expect(result.notFound[0].reason).toBe("Research failed — can be retried");
  });

  it("explains a private label by its routing, not by research it never had", () => {
    const result = buildChartResults(
      [coverage({ brandKey: "house_label", brandName: "House Label", brandType: "private" })],
      []
    );

    expect(result.notFound[0].reason).toBe("Private label — no public chart exists to find");
  });

  it("routes the unbranded sentinel to its own list, grouped by category", () => {
    const result = buildChartResults([coverage({ brandKey: "", brandName: null, brandType: "none" })], []);

    expect(result.notFound).toHaveLength(0);
    expect(result.noBrand).toHaveLength(1);
    expect(result.noBrand[0].brandName).toBe("No brand");
    expect(result.noBrand[0].reason).toContain("No brand on these products");
  });

  it("surfaces the two tables disagreeing instead of smoothing it over", () => {
    // Status says a chart was written; no chart is there. Worth seeing, not hiding.
    const result = buildChartResults([coverage({ researchStatus: "found" })], []);
    expect(result.notFound[0].reason).toBe("Recorded as found, but no chart is stored");
  });

  it("prefers this store's own chart over the shared one", () => {
    const shared = chart({ id: "shared", connectionId: null, confidence: 0.95 });
    const scoped = chart({ id: "scoped", connectionId: "conn-1", confidence: 0.5, provenance: "manual" });

    // Order reversed too, so the preference is a real rule rather than last-write-wins.
    for (const charts of [[shared, scoped], [scoped, shared]]) {
      const result = buildChartResults([coverage()], charts);
      expect(result.charts[0].id).toBe("scoped");
      expect(result.charts[0].shared).toBe(false);
    }
  });

  it("carries the chart's own defects through to the row", () => {
    const pinned = chart({
      sourceUrl: null,
      chartRows: [
        { size: "S", chest_min: 94, chest_max: 94 },
        { size: "M", chest_min: 97, chest_max: 97 },
      ],
    });

    const codes = buildChartResults([coverage()], [pinned]).charts[0].quality.map((flag) => flag.code);
    expect(codes).toContain("point_bounds");
    expect(codes).toContain("no_source");
  });

  it("lists every chart variant a brand publishes behind one coverage pair", () => {
    // The store carries one `tops` row; Tommy publishes a men's table, a women's one, and a second
    // men's fit line. All three are real charts and all three have to be visible — collapsing them
    // to one would hide whichever the resolver did not happen to pick. Doc Part 5: this set is
    // exactly what Phase 5's variant dropdown offers for Tommy + tops.
    const charts = [
      chart({ id: "mens", variantName: "Men", audience: "mens", sourceTitle: "Tops" }),
      chart({ id: "womens", variantName: "Women", audience: "womens", sourceTitle: "Tops" }),
      chart({ id: "jeans", variantName: "Tommy Jeans Men", audience: "mens", sourceTitle: "Tommy Jeans Tops" }),
    ];

    const result = buildChartResults([coverage()], charts);

    expect(result.charts.map((row) => row.id).sort()).toEqual(["jeans", "mens", "womens"]);
    // Still one pair: three charts covering one thing the store sells is not three things covered.
    expect(result.totals.pairsNeeded).toBe(1);
    expect(result.totals.chartsFound).toBe(3);
  });

  it("collapses two rows claiming the same variant, preferring the store's own", () => {
    // The identity `sizing_charts` is indexed on. Showing both would offer the merchant a choice
    // between a researched chart and their own correction of it, when the correction is the answer.
    const charts = [
      chart({ id: "shared", variantName: "Men", connectionId: null }),
      chart({ id: "mine", variantName: "Men", connectionId: "conn-1" }),
    ];

    const result = buildChartResults([coverage()], charts);

    expect(result.charts.map((row) => row.id)).toEqual(["mine"]);
  });

  it("counts charted and uncharted items separately so neither total hides the other", () => {
    const rows = [
      coverage({ id: "a", sizingCategory: "tops", skuCount: 79 }),
      coverage({ id: "b", sizingCategory: "bottoms", skuCount: 21, researchStatus: "not_covered" }),
      coverage({ id: "c", brandKey: "", brandName: null, brandType: "none", sizingCategory: "dresses", skuCount: 5 }),
    ];

    const result = buildChartResults(rows, [chart()]);

    expect(result.totals).toEqual({
      chartsFound: 1,
      brandsCharted: 1,
      chartedSkus: 79,
      pairsNeeded: 3,
      gapSkus: 26,
    });
  });

  it("orders each list by how many items it affects", () => {
    const rows = [
      coverage({ id: "small", sizingCategory: "tops", skuCount: 4, researchStatus: "not_found" }),
      coverage({ id: "big", sizingCategory: "bottoms", skuCount: 88, researchStatus: "not_found" }),
    ];

    expect(buildChartResults(rows, []).notFound.map((gap) => gap.id)).toEqual(["big", "small"]);
  });

  it("separates 'nothing found' from 'never run'", () => {
    expect(buildChartResults([coverage()], []).researched).toBe(false);
    expect(buildChartResults([coverage({ researchStatus: "not_found" })], []).researched).toBe(true);
  });

  it("treats an existing chart as proof a pass ran, even with no status recorded", () => {
    // The state right after the reason columns were added: charts from an earlier run, every status
    // still `pending`. Reading that as "never researched" would tell a merchant to pay again.
    const rows = [coverage(), coverage({ id: "cov-2", sizingCategory: "bottoms" })];
    const result = buildChartResults(rows, [chart()]);

    expect(result.researched).toBe(true);
    expect(result.notFound[0].reason).toBe("Researched, but no reason was recorded — re-run to see why");
  });

  it("says 'not researched yet' only when genuinely nothing has run", () => {
    expect(buildChartResults([coverage()], []).notFound[0].reason).toBe("Not researched yet");
  });

  it("drops a row whose sizing key this build no longer knows rather than offering an unfillable gap", () => {
    const result = buildChartResults([coverage({ sizingCategory: "not-a-real-key" })], []);

    expect(result.charts).toHaveLength(0);
    expect(result.notFound).toHaveLength(0);
    expect(result.totals.pairsNeeded).toBe(0);
  });
});
