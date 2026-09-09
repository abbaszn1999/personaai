import { describe, expect, it } from "vitest";
import { assessChart, chartSizeFamilies, chartTable, formatBounds, pinnedMeasurements, sizeScaleFamily } from "./chart-review";
import type { SizeChartRow } from "./chart-schema";

/**
 * These are the checks that caught the first real research run, so the cases below are that run's
 * actual output rather than invented shapes: Strellson's `unisex_bottoms` chart came back merging
 * women's jean sizes, EU menswear and German trouser sizing, with every height bound pinned to a
 * single value — while reporting 0.95 confidence and no source URL.
 */

describe("formatBounds", () => {
  it("renders a two-ended range", () => {
    expect(formatBounds({ min: 88, max: 96 })).toBe("88-96");
  });

  it("renders a pinned bound as the bare number rather than a fake range", () => {
    // "172-172" would read as an interval. It isn't one, and disguising that is how the defect
    // survived the first run.
    expect(formatBounds({ min: 172, max: 172 })).toBe("172");
  });

  it("keeps open-ended rows, which are the extremes a borderline shopper needs", () => {
    expect(formatBounds({ min: 120, max: null })).toBe("120+");
    expect(formatBounds({ min: null, max: 86 })).toBe("≤86");
  });

  it("has something to render when the chart says nothing", () => {
    expect(formatBounds(null)).toBe("—");
    expect(formatBounds({ min: null, max: null })).toBe("—");
  });
});

describe("chartTable", () => {
  it("only builds columns the chart has data for", () => {
    const rows: SizeChartRow[] = [
      { size: "S", chest_min: 88, chest_max: 96 },
      { size: "M", chest_min: 96, chest_max: 104 },
    ];

    const table = chartTable(rows, "tops");

    // `tops` needs chest, waist and height; this source published only chest. An empty waist column
    // would read as "this size has no waist" instead of "the guide never gave one".
    expect(table.headers).toEqual(["Size", "Chest (cm)"]);
    expect(table.rows[0]).toEqual({ Size: "S", "Chest (cm)": "88-96" });
  });

  it("keys cells by header so the renderer needs no measurement vocabulary", () => {
    const table = chartTable([{ size: "40", foot_length_min: 25, foot_length_max: 25.7 }], "footwear");
    expect(table.headers).toEqual(["Size", "Foot length (cm)"]);
    expect(table.rows).toEqual([{ Size: "40", "Foot length (cm)": "25-25.7" }]);
  });

  it("returns just a size column for a chart with no bounds at all", () => {
    expect(chartTable([{ size: "M" }], "tops")).toEqual({ headers: ["Size"], rows: [{ Size: "M" }] });
  });
});

describe("sizeScaleFamily", () => {
  it("reads alpha sizing", () => {
    for (const label of ["S", "M", "XL", "XXL", "2XL", "XXXL", "One Size"]) {
      expect(sizeScaleFamily(label)).toBe("alpha");
    }
  });

  it("treats a four-digit run as a waist+inseam pair, not a number", () => {
    // This store writes 34/31 as "3431". As a plain number it would land in numeric_high and look
    // like German trouser sizing.
    expect(sizeScaleFamily("3431")).toBe("waist_inseam");
    expect(sizeScaleFamily("3630")).toBe("waist_inseam");
  });

  it("separates the numeric scales that cannot be the same system", () => {
    expect(sizeScaleFamily("24")).toBe("numeric_low"); // women's jean waist
    expect(sizeScaleFamily("48")).toBe("numeric_mid"); // EU menswear
    expect(sizeScaleFamily("98")).toBe("numeric_high"); // German trouser sizing
  });

  it("ignores a fit or dimension prefix rather than splitting one real scale", () => {
    expect(sizeScaleFamily("R43")).toBe("numeric_mid");
    expect(sizeScaleFamily("W32")).toBe("numeric_mid");
  });

  it("keeps half sizes with their integers", () => {
    expect(sizeScaleFamily("40.5")).toBe(sizeScaleFamily("40"));
  });
});

describe("pinnedMeasurements", () => {
  it("finds a girth whose every row is a single value", () => {
    const rows: SizeChartRow[] = [
      { size: "44", chest_min: 91, chest_max: 91, waist_min: 80, waist_max: 84 },
      { size: "46", chest_min: 94, chest_max: 94, waist_min: 84, waist_max: 88 },
    ];

    // Chest is pinned; waist is a real range. Only the broken one is reported.
    expect(pinnedMeasurements(rows, "tops")).toEqual(["chest"]);
  });

  it("leaves a length alone, because one value per size is how lengths are published", () => {
    // Tommy Hilfiger's own guide prints SLEEVE as 61, 62.5, 64 — one number per size, no range.
    // Flagging that would condemn a correct chart, so the check is girth-only.
    const rows: SizeChartRow[] = [
      { size: "S", chest_min: 88, chest_max: 96, sleeve_min: 61, sleeve_max: 61 },
      { size: "M", chest_min: 96, chest_max: 104, sleeve_min: 62.5, sleeve_max: 62.5 },
    ];

    expect(pinnedMeasurements(rows, "tops")).toEqual([]);
  });

  it("does not flag a measurement the chart never mentions", () => {
    expect(pinnedMeasurements([{ size: "S", chest_min: 88, chest_max: 96 }], "tops")).toEqual([]);
  });

  it("does not flag a measurement that is pinned on only some rows", () => {
    const rows: SizeChartRow[] = [
      { size: "S", chest_min: 88, chest_max: 88 },
      { size: "M", chest_min: 96, chest_max: 104 },
    ];
    expect(pinnedMeasurements(rows, "tops")).toEqual([]);
  });
});

describe("chartSizeFamilies", () => {
  it("reports one family for a coherent chart", () => {
    const rows: SizeChartRow[] = [{ size: "S" }, { size: "M" }, { size: "L" }];
    expect(chartSizeFamilies(rows)).toEqual(["alpha"]);
  });

  it("reports every family in the merged chart the first run produced", () => {
    const rows: SizeChartRow[] = [{ size: "24" }, { size: "48" }, { size: "98" }];
    expect(chartSizeFamilies(rows)).toEqual(["numeric_low", "numeric_mid", "numeric_high"]);
  });
});

describe("assessChart", () => {
  const soundRows: SizeChartRow[] = [
    { size: "S", chest_min: 88, chest_max: 96 },
    { size: "M", chest_min: 96, chest_max: 104 },
  ];

  it("says nothing about a sound, sourced chart", () => {
    expect(assessChart({ rows: soundRows, group: "tops", sourceUrl: "https://brand.example/size-guide" })).toEqual([]);
  });

  it("flags a chart with no source, since its numbers cannot be checked", () => {
    const flags = assessChart({ rows: soundRows, group: "tops", sourceUrl: null });
    expect(flags.map((f) => f.code)).toEqual(["no_source"]);
    expect(flags[0].severity).toBe("warning");
  });

  it("flags pinned bounds as an error, naming the measurement", () => {
    const rows: SizeChartRow[] = [
      { size: "44", chest_min: 94, chest_max: 94, waist_min: 80, waist_max: 80 },
      { size: "46", chest_min: 97, chest_max: 97, waist_min: 84, waist_max: 84 },
    ];

    const flags = assessChart({ rows, group: "tops", sourceUrl: "https://brand.example" });
    const pinned = flags.find((f) => f.code === "point_bounds");

    expect(pinned?.severity).toBe("error");
    expect(pinned?.detail).toContain("chest");
    expect(pinned?.detail).toContain("waist");
  });

  it("flags a chart that mixes alpha labels with numeric ones", () => {
    // Two tables pasted together: the brand's alpha range and its numeric range in one chart, with
    // ranges that contradict each other size for size.
    const rows: SizeChartRow[] = [
      { size: "S", waist_min: 78, waist_max: 82 },
      { size: "48", waist_min: 85, waist_max: 88 },
      { size: "3431", waist_min: 86, waist_max: 90 },
    ];

    const flags = assessChart({ rows, group: "bottoms", sourceUrl: "https://brand.example" });
    const mixed = flags.find((f) => f.code === "mixed_scales");

    expect(mixed?.severity).toBe("error");
    expect(mixed?.detail).toContain("3 different kinds");
    expect(mixed?.detail).toContain("S");
  });

  it("leaves a numeric scale alone however wide its range", () => {
    // Tommy's own women's jeans table runs 24 to 34, crossing the magnitude boundary that separates
    // denim sizes from EU menswear ones. That is one scale, not three, and the boundaries only ever
    // meant anything back when a single chart was asked to hold a brand's whole guide.
    const rows: SizeChartRow[] = [
      { size: "24", waist_min: 60, waist_max: 64 },
      { size: "30", waist_min: 74, waist_max: 78 },
      { size: "48", waist_min: 96, waist_max: 100 },
      { size: "98", waist_min: 100, waist_max: 104 },
    ];

    const flags = assessChart({ rows, group: "bottoms", sourceUrl: "https://brand.example" });
    expect(flags.map((f) => f.code)).toEqual([]);
  });

  it("does not read an unrecognised kids label as a second scale", () => {
    // A kids guide labels rows `NB`, `3M`, `PRE44`. Those are unrecognised, not a different system.
    const rows: SizeChartRow[] = [
      { size: "NB", chest_min: 40, chest_max: 42 },
      { size: "3M", chest_min: 42, chest_max: 44 },
      { size: "PRE44", chest_min: 44, chest_max: 46 },
    ];

    const flags = assessChart({ rows, group: "tops", sourceUrl: "https://brand.example" });
    expect(flags.map((f) => f.code)).toEqual([]);
  });

  it("keeps a brand's tall range together with the rest of its alpha sizes", () => {
    const rows: SizeChartRow[] = [
      { size: "XL", chest_min: 110, chest_max: 114 },
      { size: "XLT", chest_min: 123, chest_max: 127 },
      { size: "2XLT", chest_min: 128, chest_max: 132 },
    ];

    const flags = assessChart({ rows, group: "tops", sourceUrl: "https://brand.example" });
    expect(flags.map((f) => f.code)).toEqual([]);
  });

  it("flags a chart of bare labels and stops there", () => {
    const flags = assessChart({ rows: [{ size: "S" }, { size: "M" }], group: "tops", sourceUrl: null });

    // Every other check reads bounds, so once there are none the only honest findings are "no
    // measurements" and "no source".
    expect(flags.map((f) => f.code)).toEqual(["no_bounds", "no_source"]);
  });

  it("flags a single-row chart as unable to choose between sizes", () => {
    const flags = assessChart({
      rows: [{ size: "M", chest_min: 96, chest_max: 104 }],
      group: "tops",
      sourceUrl: "https://brand.example",
    });

    expect(flags.map((f) => f.code)).toEqual(["too_few_rows"]);
  });

  it("reports errors before warnings, so the badge row leads with what blocks use", () => {
    const rows: SizeChartRow[] = [
      { size: "24", waist_min: 86, waist_max: 86 },
      { size: "48", waist_min: 85, waist_max: 85 },
    ];

    const flags = assessChart({ rows, group: "bottoms", sourceUrl: null });
    const severities = flags.map((f) => f.severity);

    expect(severities.indexOf("error")).toBeLessThan(severities.lastIndexOf("warning"));
  });
});
