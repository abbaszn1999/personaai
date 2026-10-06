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

  it("resolves against every listed size but publishes rows only for the purchasable ones", () => {
    const result = resolveProductChart({ ...product, rawSizeFormat: "S,M", purchasableSizeFormat: "M" }, context());
    expect(result.status).toBe("matched");
    if (result.status !== "matched") return;
    expect(result.canonicalSizes).toEqual(["M"]);
    expect(result.sizeMatches.map((match) => match.canonical)).toEqual(["M"]);
  });

  it("still resolves a sold-out product's chart and publishes no rows", () => {
    const result = resolveProductChart({ ...product, rawSizeFormat: "S,M", purchasableSizeFormat: null }, context());
    expect(result.status).toBe("matched");
    if (result.status !== "matched") return;
    expect(result.sizeMatches).toEqual([]);
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

  it("uses the stocked labels to choose between age-band charts sharing a leaf", () => {
    const infant = chart({
      id: "infant",
      variantName: "Infant",
      applicability: { ageBand: { minMonths: 0, maxMonths: 24 } },
      chartRows: [{ size: "6M", aliases: { age: ["3–6M", "3-6 months"] }, chest_min: 42, chest_max: 45 }],
    });
    const child = chart({
      id: "child",
      variantName: "Boys & Girls",
      applicability: { ageBand: { minMonths: 36, maxMonths: 192 } },
      chartRows: [{ size: "4Y", aliases: { age: ["4Y", "4 years"] }, chest_min: 54, chest_max: 58 }],
    });
    const result = resolveProductChart(
      { ...product, rawSizeFormat: "3-6 months", sizeType: "Age" },
      context("global", { sharedCharts: [infant, child] }),
    );
    expect(result.status).toBe("matched");
    if (result.status === "matched") expect(result.chart.id).toBe("infant");
  });

  it("refuses fit-class-only coverage", () => {
    expect(resolveProductChart(
      product,
      context("global", { sharedCharts: [chart({ variantName: "Women Petite" })] }),
    ).status).toBe("fit-only");
  });

  it("selects a fit-class chart only when the product supplies that fit", () => {
    const result = resolveProductChart(
      { ...product, fitClass: "Petite" },
      context("global", {
        sharedCharts: [chart({
          variantName: "Women Petite",
          applicability: { fitClass: "Petite" },
        })],
      }),
    );
    expect(result.status).toBe("matched");
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

  it("requires explicit unisex coverage for an adult-unisex leaf", () => {
    const result = resolveProductChart(
      { ...product, primaryPersonaLeafKey: "unisex:top:t-shirt" },
      context("global", {
        sharedCharts: [chart({
          audience: "womens",
          coversLeaves: ["unisex:top:t-shirt"],
        })],
      }),
    );
    expect(result.status).toBe("no-chart");
  });

  it("allows a private chart to claim an exact custom leaf", () => {
    const custom = chart({
      connectionId: "connection-1",
      brandKey: "house_label",
      coversLeaves: ["custom:womens-tees"],
    });
    const result = resolveProductChart(
      {
        ...product,
        brandKey: "house_label",
        primaryPersonaLeafKey: "custom:womens-tees",
      },
      context("private", {
        brandTypes: new Map([["house_label", "private"]]),
        sharedCharts: [],
        privateCharts: [custom],
      }),
    );
    expect(result.status).toBe("matched");
  });

  it("reports a verified unsupported-source state instead of a generic missing chart", () => {
    const result = resolveProductChart(
      { ...product, primaryPersonaLeafKey: "women:top:bra" },
      context("global", {
        sharedCharts: [],
        unsupportedSources: [{
          brandKey: "tom_tailor",
          leafKey: "women:top:bra",
          reason: "Official guide publishes no bra table",
          missingFields: ["chest", "underbust"],
          verifiedAt: "2026-10-01",
        }],
      }),
    );
    expect(result.status).toBe("unsupported-source");
    expect(result.unsupportedSource?.missingFields).toEqual(["chest", "underbust"]);
  });

  describe("tie-breaking between charts that all fit the stocked labels", () => {
    const rows = [
      { size: "S", aliases: { alpha: "S" }, chest_min: 84, chest_max: 90 },
      { size: "M", aliases: { alpha: "M" }, chest_min: 90, chest_max: 98 },
    ];
    const plain = chart({ id: "plain", variantName: "Women", chartRows: rows });
    const denim = chart({
      id: "denim",
      variantName: "Denim Female Tops",
      chartRows: rows,
      applicability: { productLine: "Denim Female" },
    });

    it("prefers the plain table when the product never names a product line", () => {
      const result = resolveProductChart(product, context("global", { sharedCharts: [denim, plain] }));
      expect(result.status).toBe("matched");
      expect(result.status === "matched" && result.chart.id).toBe("plain");
    });

    it("uses the product-line table when the product names its line", () => {
      const result = resolveProductChart(
        { ...product, productLine: "Denim Female" },
        context("global", { sharedCharts: [denim, plain] }),
      );
      expect(result.status === "matched" && result.chart.id).toBe("denim");
    });

    it("falls back to a product-line table when it is the only chart that fits the labels", () => {
      const onlyDenim = chart({
        id: "denim-only",
        variantName: "Denim Female Tops",
        chartRows: [{ size: "S", aliases: { alpha: "S" }, chest_min: 84, chest_max: 90 }],
        applicability: { productLine: "Denim Female" },
      });
      const result = resolveProductChart(
        { ...product, rawSizeFormat: "S" },
        context("global", { sharedCharts: [onlyDenim] }),
      );
      expect(result.status).toBe("matched");
    });

    it("stays ambiguous when two plain tables fit and nothing distinguishes them", () => {
      const other = chart({ id: "other", variantName: "Women Alt", chartRows: rows });
      const result = resolveProductChart(product, context("global", { sharedCharts: [plain, other] }));
      expect(result.status).toBe("ambiguous");
    });
  });

  it("lets a kids-unisex product reach the Boys chart when its own title says boys", () => {
    const boys = chart({
      id: "boys",
      sizingCategory: "tops",
      variantName: "Boys",
      audience: "boys",
      coversLeaves: ["kids-boys:top:t-shirt"],
      chartRows: [{ size: "98", aliases: { eu: "98", age: ["3y", "3"] }, chest_min: 54, chest_max: 56 }],
    });
    const input = {
      ...product,
      primaryPersonaLeafKey: "kids-unisex:top:t-shirt",
      rawSizeFormat: "3",
    };
    const ctx = context("global", { sharedCharts: [boys] });
    expect(resolveProductChart(input, ctx).status).toBe("no-chart");
    expect(resolveProductChart({ ...input, audienceHint: "boys" }, ctx).status).toBe("matched");
    expect(resolveProductChart({ ...input, audienceHint: "girls" }, ctx).status).toBe("no-chart");
  });

  it("reports stocked labels the source does not publish as unsupported, not as an unresolved chart", () => {
    const state = {
      brandKey: "tom_tailor",
      leafKey: "women:top:t-shirt",
      labels: ["XXXS"],
      reason: "No row is published for XXXS",
      missingFields: [],
      verifiedAt: "2026-10-05",
    };
    const ctx = context("global", { unsupportedSources: [state] });
    expect(resolveProductChart({ ...product, rawSizeFormat: "SMALL,XXXS" }, ctx).status)
      .toBe("unsupported-source");
    expect(resolveProductChart({ ...product, rawSizeFormat: "SMALL,XXXXS" }, ctx).status)
      .toBe("sizes-unresolved");
  });
});
