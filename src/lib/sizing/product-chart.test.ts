import { describe, expect, it } from "vitest";
import type { SizingChartRow } from "@/lib/db/sizing-charts";
import type { BrandType } from "@/lib/db/sizing-coverage";
import type { StoreBrandMapping } from "./brand-mapping";
import {
  resolveProductChart,
  type ProductChartInput,
  type SizingResolutionContext,
} from "./product-chart";

const mapping: StoreBrandMapping = {
  version: 1,
  confirmedAt: "2026-09-25T00:00:00.000Z",
  sourceFingerprint: "current",
  observed: {},
  aliases: {
    tom_tailor_women: {
      canonicalKey: "tom_tailor",
      canonicalName: "Tom Tailor",
      labels: ["Tom Tailor Women"],
      skuCount: 1,
      sizingCategories: ["tops"],
    },
  },
};

function chart(overrides: Partial<SizingChartRow> = {}): SizingChartRow {
  return {
    id: "chart-1",
    connectionId: null,
    brandKey: "tom_tailor",
    sizingCategory: "tops",
    variantName: "Women",
    coversLeaves: ["women:top:t-shirt"],
    audience: "womens",
    sourceTitle: "Women",
    chartRows: [
      { size: "S", aliases: { alpha: "S" }, chest_min: 84, chest_max: 90 },
      { size: "M", aliases: { alpha: "M" }, chest_min: 90, chest_max: 98 },
    ],
    confidence: 1,
    sourceUrl: null,
    provenance: "manual",
    version: 1,
    updatedAt: "2026-09-25T00:00:00.000Z",
    ...overrides,
  };
}

function context(
  type: BrandType = "global",
  overrides: Partial<SizingResolutionContext> = {},
): SizingResolutionContext {
  return {
    brandTypes: new Map([["tom_tailor_women", type]]),
    brandMapping: mapping,
    brandMappingCurrent: true,
    sizeSettings: { default: "Alpha", overrides: {} },
    sharedCharts: [chart()],
    privateCharts: [],
    ...overrides,
  };
}

const product: ProductChartInput = {
  brandKey: "tom_tailor_women",
  sizingCategory: "tops",
  primaryPersonaLeafKey: "women:top:t-shirt",
  rawSizeFormat: "SMALL,MEDIUM",
};

describe("resolveProductChart", () => {
  it("routes a global alias to its canonical shared chart and canonicalizes labels", () => {
    const result = resolveProductChart(product, context());
    expect(result.status).toBe("matched");
    if (result.status !== "matched") return;
    expect(result.canonicalBrandKey).toBe("tom_tailor");
    expect(result.canonicalSizes).toEqual(["S", "M"]);
    expect(result.chartKey).toBe("tom_tailor|tops|women|alpha|v1");
  });

  it("keeps a raw-brand size-system override after canonical brand mapping", () => {
    const result = resolveProductChart(
      { ...product, rawSizeFormat: "36,38" },
      context("global", {
        sizeSettings: { default: "Alpha", overrides: { tom_tailor_women: "EU" } },
        sharedCharts: [chart({
          chartRows: [
            { size: "S", aliases: { eu: "36" }, chest_min: 84, chest_max: 90 },
            { size: "M", aliases: { eu: "38" }, chest_min: 90, chest_max: 98 },
          ],
        })],
      }),
    );

    expect(result.status).toBe("matched");
    if (result.status !== "matched") return;
    expect(result.canonicalSizes).toEqual(["36", "38"]);
    expect(result.chartKey).toBe("tom_tailor|tops|women|eu|v1");
  });

  it("keeps private charts isolated to the connection-scoped source", () => {
    const privateChart = chart({ connectionId: "connection-1", brandKey: "house_label" });
    const result = resolveProductChart(
      { ...product, brandKey: "house_label" },
      context("private", {
        brandTypes: new Map([["house_label", "private"]]),
        sharedCharts: [chart({ brandKey: "house_label" })],
        privateCharts: [privateChart],
      }),
    );
    expect(result.status).toBe("matched");
    if (result.status === "matched") expect(result.chart.connectionId).toBe("connection-1");
  });

  it("requires a current confirmed mapping for global brands", () => {
    expect(resolveProductChart(product, context("global", { brandMappingCurrent: false })).status)
      .toBe("stale-brand-mapping");
  });

  it("does not guess when several ordinary charts claim one leaf", () => {
    expect(resolveProductChart(
      product,
      context("global", { sharedCharts: [chart(), chart({ id: "chart-2", variantName: "Women 2" })] }),
    ).status).toBe("ambiguous");
  });

  it("refuses fit-class-only coverage", () => {
    expect(resolveProductChart(
      product,
      context("global", { sharedCharts: [chart({ variantName: "Women Petite" })] }),
    ).status).toBe("fit-only");
  });

  it.each([
    [{ ...product, primaryPersonaLeafKey: null }, "no-leaf"],
    [{ ...product, sizingCategory: "bottoms" }, "parent-mismatch"],
    [{ ...product, rawSizeFormat: null }, "sizes-unknown"],
    [{ ...product, rawSizeFormat: "S,UNKNOWN" }, "sizes-unresolved"],
  ] as const)("reports %s as %s", (input, status) => {
    expect(resolveProductChart(input, context()).status).toBe(status);
  });

  it("does not cross adult audiences", () => {
    expect(resolveProductChart(
      product,
      context("global", { sharedCharts: [chart({ audience: "mens" })] }),
    ).status).toBe("no-chart");
  });
});
