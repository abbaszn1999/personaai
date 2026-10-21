import { describe, expect, it } from "vitest";
import {
  DEMO_ACS_ROWS,
  DEMO_BRAND_ROWS,
  DEMO_CHARTS,
  DEMO_CHART_TOTALS,
  DEMO_GAPS_GLOBAL,
  DEMO_GAPS_NOT_FOUND,
  DEMO_GAPS_NO_BRAND,
  DEMO_LEAF_COUNTS,
  DEMO_MAPPED_LEAVES,
  DEMO_PRODUCTS,
  DEMO_RESOLUTION_SUMMARY,
} from "./demo-sizing-data";

describe("sync demo data", () => {
  it("describes a 48 SKU delta batch", () => {
    expect(DEMO_PRODUCTS).toHaveLength(48);
    expect(new Set(DEMO_PRODUCTS.map((product) => product.sku)).size).toBe(48);
  });

  it("agrees with itself across Stage 4 and Stage 5", () => {
    const gapSkus = [...DEMO_GAPS_GLOBAL, ...DEMO_GAPS_NOT_FOUND, ...DEMO_GAPS_NO_BRAND].reduce(
      (sum, gap) => sum + gap.skuCount,
      0,
    );
    // Every SKU without a chart is a gap, and every gap SKU is an unresolved product.
    expect(gapSkus).toBe(DEMO_CHART_TOTALS.gapSkus);
    expect(DEMO_RESOLUTION_SUMMARY.unresolved).toBe(gapSkus);
    expect(DEMO_RESOLUTION_SUMMARY.matched + DEMO_RESOLUTION_SUMMARY.unresolved).toBe(48);
    expect(DEMO_CHART_TOTALS.chartedSkus + DEMO_CHART_TOTALS.gapSkus).toBe(48);
    expect(DEMO_RESOLUTION_SUMMARY.unresolvedGroups?.reduce((sum, group) => sum + group.count, 0)).toBe(gapSkus);
    expect(DEMO_LEAF_COUNTS.reduce((sum, entry) => sum + entry.skuCount, 0)).toBe(48);
  });

  it("produces one PRIMARY record per product plus its variants", () => {
    expect(DEMO_ACS_ROWS.filter((row) => row.type === "PRIMARY")).toHaveLength(48);
    expect(DEMO_RESOLUTION_SUMMARY.variantCount).toBe(DEMO_ACS_ROWS.filter((row) => row.type === "VARIANT").length);
    // Unresolved products carry no sizing payload; resolved ones carry exact rows.
    const unresolved = DEMO_ACS_ROWS.filter((row) => row.fitChartVariant === null);
    expect(unresolved.length).toBeGreaterThan(0);
    expect(unresolved.every((row) => row.fitRows.length === 0)).toBe(true);
    const resolved = DEMO_ACS_ROWS.filter((row) => row.fitChartVariant !== null);
    expect(resolved.every((row) => row.fitRows.length === row.fitSizeLabels.length)).toBe(true);
  });

  it("charts every global brand except the one whose guide has no trouser table", () => {
    const status = Object.fromEntries(DEMO_BRAND_ROWS.map((brand) => [brand.brandKey, brand.status]));
    expect(status).toEqual({
      nike: "done",
      adidas: "done",
      carhartt_wip: "done",
      salomon: "done",
      arcteryx: "partial",
    });
  });

  it("only claims leaves the demo store's taxonomy enables", () => {
    for (const chart of DEMO_CHARTS) {
      expect(chart.coversLeaves.some((leaf) => DEMO_MAPPED_LEAVES.includes(leaf))).toBe(true);
      expect(chart.headers[0]).toBe("Size");
      expect(chart.rows.length).toBeGreaterThanOrEqual(4);
    }
  });
});
