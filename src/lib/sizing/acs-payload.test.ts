import { describe, expect, it } from "vitest";
import { buildAcsSizingPayload } from "./acs-payload";
import type { MatchedProductChart } from "./product-chart";
import type { SizeChartRow } from "./chart-schema";

function resolution(): MatchedProductChart {
  const rows: SizeChartRow[] = [
    { size: "XS", chest_min: 84, chest_max: 89, waist_min: 70, waist_max: 75, body_length_min: 60 },
    { size: "M", chest_min: 94, chest_max: 99, waist_min: 80, waist_max: 86, body_length_min: 65 },
    { size: "XXL", chest_min: 114 },
  ];
  return {
    status: "matched",
    leafKey: "men:top:t-shirt",
    canonicalBrandKey: "brand",
    unmatchedLabels: [],
    chartKey: "brand|tops|men|alpha|v1",
    canonicalSizes: ["XS", "M"],
    needsReview: false,
    chart: {
      id: "chart",
      connectionId: null,
      brandKey: "brand",
      sizingCategory: "tops",
      variantName: "Men",
      coversLeaves: ["men:top:t-shirt"],
      audience: "mens",
      sourceTitle: "Men",
      chartRows: rows,
      confidence: 1,
      sourceUrl: null,
      provenance: "manual",
      version: 1,
      updatedAt: "2026-09-25",
    },
    sizeMatches: [
      { raw: "XSMALL", canonical: "XS", row: rows[0] },
      { raw: "MEDIUM", canonical: "M", row: rows[1] },
    ],
  };
}

describe("buildAcsSizingPayload", () => {
  it("writes only stocked rows and excludes garment measurements", () => {
    const payload = buildAcsSizingPayload(resolution());
    expect(payload.entries.map((entry) => entry.label)).toEqual(["XS", "M"]);
    expect(payload.entries.some((entry) => entry.rowJson.includes("XXL"))).toBe(false);
    expect(payload.entries.some((entry) => entry.rowJson.includes("body_length"))).toBe(false);
  });

  it("builds a recall-preserving required-measurement envelope", () => {
    expect(buildAcsSizingPayload(resolution()).envelopes).toMatchObject({
      chest_min: 84,
      chest_max: 99,
    });
  });

  it("uses a wide sentinel for an open end", () => {
    const input = resolution();
    input.sizeMatches = [{
      raw: "XXL",
      canonical: "XXL",
      row: { size: "XXL", chest_min: 114 },
    }];
    expect(buildAcsSizingPayload(input).envelopes.chest_max).toBe(1_000);
    expect(buildAcsSizingPayload(input).entries[0].rowJson).toContain('"chest":[114,null]');
  });
});
