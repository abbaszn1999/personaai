import { describe, expect, it } from "vitest";
import type { SizingChartRow } from "@/lib/db/sizing-charts";
import type { SizingResolutionContext } from "./product-chart";
import { evaluateSizingPublicationGate } from "./completion-gates";

const chart: SizingChartRow = {
  id: "chart",
  connectionId: null,
  brandKey: "brand",
  sizingCategory: "tops",
  variantName: "Women tops",
  coversLeaves: ["women:top:t-shirt"],
  audience: "womens",
  sourceTitle: "Women tops",
  chartRows: [{ size: "S", aliases: { alpha: "S" }, chest_min: 82, chest_max: 88 }],
  confidence: 1,
  sourceUrl: "https://example.com/sizes",
  provenance: "manual",
  version: 1,
  updatedAt: "2026-10-01",
};

const context: SizingResolutionContext = {
  brandTypes: new Map([["brand", "global"]]),
  brandMapping: { version: 1, confirmedAt: "2026-10-01", sourceFingerprint: "", observed: {}, aliases: {} },
  brandMappingCurrent: true,
  sizeSettings: { default: "Alpha", overrides: {} },
  sharedCharts: [chart],
  privateCharts: [],
};

describe("evaluateSizingPublicationGate", () => {
  it("passes only when every demanded product, leaf, and label resolves", () => {
    const result = evaluateSizingPublicationGate([{
      productId: "p1",
      input: {
        brandKey: "brand",
        sizingCategory: "tops",
        primaryPersonaLeafKey: "women:top:t-shirt",
        rawSizeFormat: "S",
      },
    }], context);
    expect(result).toMatchObject({ publishable: true, demandedProducts: 1, matchedProducts: 1 });
    expect(result.demandedLeaves).toEqual(["women:top:t-shirt"]);
    expect(result.demandedLabels).toEqual(["S"]);
  });

  it("blocks publication and identifies the exact unresolved product and label", () => {
    const result = evaluateSizingPublicationGate([{
      productId: "p2",
      input: {
        brandKey: "brand",
        sizingCategory: "tops",
        primaryPersonaLeafKey: "women:top:t-shirt",
        rawSizeFormat: "XL",
      },
    }], context);
    expect(result.publishable).toBe(false);
    expect(result.issues[0]).toMatchObject({
      productId: "p2",
      status: "sizes-unresolved",
      unmatchedLabels: ["XL"],
    });
  });
});
