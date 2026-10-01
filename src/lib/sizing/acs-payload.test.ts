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

  it("builds recall-preserving envelopes for every category measurement", () => {
    expect(buildAcsSizingPayload(resolution()).envelopes).toMatchObject({
      chest_min: 84,
      chest_max: 99,
      waist_min: 70,
      waist_max: 86,
    });
  });

  it("publishes every bottoms measurement, including hip and inseam", () => {
    const input = resolution();
    const row: SizeChartRow = {
      size: "33",
      waist_min: 85,
      waist_max: 86,
      hip_min: 101,
      hip_max: 102,
      inseam_min: 81,
      inseam_max: 83,
    };
    input.chart.sizingCategory = "bottoms";
    input.chart.chartRows = [row];
    input.sizeMatches = [{ raw: "33", canonical: "33", row }];

    expect(buildAcsSizingPayload(input).envelopes).toEqual({
      waist_min: 85,
      waist_max: 86,
      hip_min: 101,
      hip_max: 102,
      inseam_min: 81,
      inseam_max: 83,
    });
  });

  it("publishes the footwear length envelope", () => {
    const input = resolution();
    const row: SizeChartRow = { size: "41", foot_length_min: 25.5, foot_length_max: 26 };
    input.chart.sizingCategory = "footwear";
    input.chart.chartRows = [row];
    input.sizeMatches = [{ raw: "41", canonical: "41", row }];

    expect(buildAcsSizingPayload(input).envelopes).toEqual({
      foot_length_min: 25.5,
      foot_length_max: 26,
    });
  });

  it("publishes every kids full-body dimension and normalizes age to months", () => {
    const input = resolution();
    const row: SizeChartRow = {
      size: "8-9Y",
      aliases: { age: "8-9y" },
      chest_min: 66,
      chest_max: 72,
      waist_min: 58,
      waist_max: 62,
      hip_min: 72,
      hip_max: 78,
      height_min: 128,
      height_max: 140,
    };
    input.chart.sizingCategory = "dresses";
    input.chart.audience = "girls";
    input.chart.chartRows = [row];
    input.sizeMatches = [{ raw: "8-9Y", canonical: "8-9Y", row }];

    const payload = buildAcsSizingPayload(input);
    expect(payload.envelopes).toMatchObject({
      chest_min: 66,
      chest_max: 72,
      waist_min: 58,
      waist_max: 62,
      hip_min: 72,
      hip_max: 78,
      height_min: 128,
      height_max: 140,
      age_months_min: 96,
      age_months_max: 119,
    });
    expect(payload.entries[0].rowJson).toContain('"age_months":[96,119]');
  });

  it("turns infant month labels into non-overlapping age buckets", () => {
    const input = resolution();
    const threeMonths: SizeChartRow = {
      size: "3M",
      aliases: { age: "3M" },
      height_min: 56,
      height_max: 62,
      chest_min: 42,
      waist_min: 41,
    };
    const sixMonths: SizeChartRow = {
      size: "6M",
      aliases: { age: "6M" },
      height_min: 62,
      height_max: 68,
      chest_min: 44,
      waist_min: 43,
    };
    input.chart.audience = "kids";
    input.chart.chartRows = [threeMonths, sixMonths];
    input.sizeMatches = [{ raw: "6M", canonical: "6M", row: sixMonths }];

    expect(buildAcsSizingPayload(input).envelopes).toMatchObject({
      age_months_min: 4,
      age_months_max: 6,
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
