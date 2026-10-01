import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChartGap, SizingRun } from "./server-types";
import { useSizingStore } from "./store";

function gap(overrides: Partial<ChartGap> = {}): ChartGap {
  return {
    id: "moustache-footwear",
    brandKey: "moustache",
    brandName: "MOUSTACHE Men Shoes",
    brandType: "private",
    sizingCategory: "footwear",
    skuCount: 37,
    storeCategoryPaths: [["Men", "Shoes"]],
    researchStatus: "pending",
    researchNote: null,
    reason: "Private label — no public chart exists to find",
    sampleSkus: [],
    ...overrides,
  };
}

describe("manual private-chart target", () => {
  afterEach(() => {
    useSizingStore.setState({ chartLeafCounts: [], manualChartTarget: null });
  });

  it("offers only exact leaves carried by this brand and parent", () => {
    useSizingStore.setState({
      chartLeafCounts: [
        { brandKey: "moustache", leafKey: "men:footwear:sneaker", skuCount: 20 },
        { brandKey: "moustache", leafKey: "men:footwear:dress-shoe", skuCount: 17 },
        { brandKey: "moustache", leafKey: "women:footwear:heel", skuCount: 0 },
        { brandKey: "another-brand", leafKey: "women:footwear:heel", skuCount: 12 },
        { brandKey: "moustache", leafKey: "men:top:t-shirt", skuCount: 4 },
      ],
    });

    useSizingStore.getState().openManualChart(gap());

    expect(useSizingStore.getState().manualChartTarget?.coversLeaves).toEqual([
      "men:footwear:sneaker",
      "men:footwear:dress-shoe",
    ]);
  });
});

function completedRun(): SizingRun {
  return {
    id: "run-complete",
    connectionId: "connection-1",
    kind: "setup",
    status: "complete",
    stage: "publish",
    productsScanned: 2839,
    phase: null,
    phaseDone: null,
    phaseTotal: null,
    researchBrandKeys: [],
    researchCurrentBrandKey: null,
    researchForce: false,
    error: null,
    publishedAt: "2026-09-29T12:00:00.000Z",
    createdAt: "2026-09-29T10:00:00.000Z",
    updatedAt: "2026-09-29T12:00:00.000Z",
  };
}

function stubCompletedRunResponse() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          run: completedRun(),
          summary: { totalSkus: 0, chartsNeeded: 0, brands: [], categories: [], counts: {} },
          identification: { globalBrands: [], privateBrands: [], nullProducts: [] },
          routing: { researchQueue: [], manualQueue: [] },
          mappingApproved: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )
  );
}

describe("persisted setup stage restoration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useSizingStore.getState().stopPolling();
    useSizingStore.setState({
      stage: 1,
      highestStage: 1,
      stageRestored: false,
      run: null,
      runLoading: false,
      runError: null,
    });
  });

  it("restores a completed server run to stage 5 instead of the initial stage 1", async () => {
    useSizingStore.setState({ stage: 1, highestStage: 1, stageRestored: false });
    stubCompletedRunResponse();

    await useSizingStore.getState().loadRun();

    expect(useSizingStore.getState().stage).toBe(5);
    expect(useSizingStore.getState().highestStage).toBe(5);
    expect(useSizingStore.getState().stageRestored).toBe(true);
  });

  it("does not override manual navigation during normal background polling", async () => {
    useSizingStore.setState({ stage: 2, highestStage: 5, stageRestored: true });
    stubCompletedRunResponse();

    await useSizingStore.getState().loadRun();

    expect(useSizingStore.getState().stage).toBe(2);
    expect(useSizingStore.getState().highestStage).toBe(5);
  });

  it("restores the last viewed stage without losing authoritative progress", async () => {
    useSizingStore.setState({ stage: 1, highestStage: 1, stageRestored: false });
    stubCompletedRunResponse();

    await useSizingStore.getState().loadRun({ restoreStage: true, preferredStage: 4 });

    expect(useSizingStore.getState().stage).toBe(4);
    expect(useSizingStore.getState().highestStage).toBe(5);
    expect(useSizingStore.getState().stageRestored).toBe(true);
  });
});
