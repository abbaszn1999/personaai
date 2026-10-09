import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChartGap, SizingRun } from "./server-types";
import { clearSamplePages, useSizingStore } from "./store";

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
    missingLeaves: [],
    missingLeafCounts: {},
    partial: false,
    ...overrides,
  };
}

describe("manual private-chart target", () => {
  afterEach(() => {
    useSizingStore.setState({
      chartLeafCounts: [],
      chartGapsNotFound: [],
      chartGapsNoBrand: [],
      manualChartTarget: null,
    });
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

  it("seeds a gap from the leaves the server says are still uncovered", () => {
    useSizingStore.setState({
      chartLeafCounts: [
        { brandKey: "moustache", leafKey: "men:footwear:sneaker", skuCount: 20 },
        { brandKey: "moustache", leafKey: "men:footwear:dress-shoe", skuCount: 17 },
      ],
    });

    useSizingStore.getState().openManualChart(gap({ missingLeaves: ["men:footwear:dress-shoe"], partial: true }));

    expect(useSizingStore.getState().manualChartTarget?.coversLeaves).toEqual(["men:footwear:dress-shoe"]);
  });

  it("lets an edited chart add the brand's still-uncovered leaves without pre-selecting them", () => {
    useSizingStore.setState({
      chartGapsNotFound: [gap({ missingLeaves: ["men:footwear:dress-shoe"], partial: true })],
    });

    useSizingStore.getState().editManualChart({
      id: "chart-1",
      brand: "MOUSTACHE Men Shoes",
      brandKey: "moustache",
      sizingCategory: "footwear",
      variantName: "Men - Sneaker",
      audience: "mens",
      shared: false,
      skuCount: 20,
      chartRows: [],
      coversLeaves: ["men:footwear:sneaker"],
    } as unknown as Parameters<ReturnType<typeof useSizingStore.getState>["editManualChart"]>[0]);

    const target = useSizingStore.getState().manualChartTarget;
    expect(target?.coversLeaves).toEqual(["men:footwear:sneaker", "men:footwear:dress-shoe"]);
    expect(target?.selectedLeaves).toEqual(["men:footwear:sneaker"]);
    expect(target?.chartId).toBe("chart-1");
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

  it("lets a stage mount reuse a run read moments ago, but never a write's read-back", async () => {
    stubCompletedRunResponse();
    await useSizingStore.getState().loadRun();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();

    await useSizingStore.getState().loadRun({ ifStale: true });
    expect(fetchMock).not.toHaveBeenCalled();

    await useSizingStore.getState().loadRun();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-reads on mount when the run is still working, so a broken poll chain restarts", async () => {
    stubCompletedRunResponse();
    await useSizingStore.getState().loadRun();
    useSizingStore.setState({ run: { ...completedRun(), status: "running", stage: "scan" } });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();

    await useSizingStore.getState().loadRun({ ifStale: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares one request between screens mounting together", async () => {
    stubCompletedRunResponse();
    useSizingStore.setState({ run: { ...completedRun(), status: "running", stage: "scan" } });
    const fetchMock = vi.mocked(fetch);

    await Promise.all([
      useSizingStore.getState().loadRun({ ifStale: true }),
      useSizingStore.getState().loadRun({ ifStale: true }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function samplePageResponse(rows: number, nextCursor: string | null) {
  return new Response(
    JSON.stringify({
      rows: Array.from({ length: rows }, (_, index) => ({ externalId: `p${index}`, title: `Product ${index}` })),
      nextCursor,
      pageSize: 25,
      selectionTotal: 50,
      selectionTotalExact: true,
      filteredTotal: null,
      typeCounts: null,
      typeItemCounts: null,
      parentCounts: null,
      filtering: false,
      scanned: true,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("Item Preview page cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearSamplePages();
    useSizingStore.setState({
      sample: [],
      samplePage: 1,
      sampleCursors: [null],
      sampleNextCursor: null,
      sampleTotal: null,
      sampleLoaded: false,
      sampleBrandType: null,
      sampleParent: null,
      sampleBrandKey: null,
      samplePath: null,
      sampleSource: null,
      sampleFacets: null,
      sampleQuery: "",
    });
  });

  function stubPages() {
    const fetchMock = vi.fn((url: string) => {
      const cursor = new URL(url, "http://localhost").searchParams.get("cursor");
      return Promise.resolve(cursor ? samplePageResponse(2, null) : samplePageResponse(3, "25"));
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const sampleRequests = (fetchMock: ReturnType<typeof stubPages>) =>
    fetchMock.mock.calls.filter(([url]) => String(url).includes("/sizing/sample"));

  it("reads the next page ahead and pages back without asking the server again", async () => {
    const fetchMock = stubPages();

    await useSizingStore.getState().goToSamplePage(1);
    await vi.waitFor(() => expect(sampleRequests(fetchMock)).toHaveLength(2));

    await useSizingStore.getState().goToSamplePage(2);
    expect(useSizingStore.getState().sample).toHaveLength(2);
    await useSizingStore.getState().goToSamplePage(1);
    expect(useSizingStore.getState().sample).toHaveLength(3);

    expect(sampleRequests(fetchMock)).toHaveLength(2);
  });

  it("reads again after anything that changes what a page holds", async () => {
    const fetchMock = stubPages();
    await useSizingStore.getState().goToSamplePage(1);
    await vi.waitFor(() => expect(sampleRequests(fetchMock)).toHaveLength(2));

    useSizingStore.getState().invalidateSamplePages();
    await useSizingStore.getState().goToSamplePage(1);

    expect(sampleRequests(fetchMock).length).toBeGreaterThanOrEqual(3);
  });

  it("re-reads the store when the merchant presses refresh", async () => {
    const fetchMock = stubPages();
    await useSizingStore.getState().goToSamplePage(1);
    useSizingStore.setState({ sampleLoaded: true });

    await useSizingStore.getState().loadSample({ force: true });

    const fresh = sampleRequests(fetchMock).filter(([url]) => String(url).includes("fresh=1"));
    expect(fresh).toHaveLength(1);
  });

  function pageWithBrandTypes(types: string[]) {
    return new Response(
      JSON.stringify({
        rows: types.map((brandType, index) => ({ externalId: `p${index}`, title: `P${index}`, brandType })),
        nextCursor: null,
        pageSize: 25,
        selectionTotal: types.length,
        selectionTotalExact: true,
        filteredTotal: null,
        scanned: true,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  it("re-reads a first page that arrived with unclassified rows instead of painting it grey", async () => {
    const answers = [pageWithBrandTypes(["unclassified", "private"]), pageWithBrandTypes(["private", "private"])];
    const fetchMock = vi.fn(() => Promise.resolve(answers.shift()!));
    vi.stubGlobal("fetch", fetchMock);

    await useSizingStore.getState().goToSamplePage(1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useSizingStore.getState().sample.map((row) => row.brandType)).toEqual(["private", "private"]);
  });

  it("sends brand, path and collection filters, restarts paging, and keeps each combination's page apart", async () => {
    const fetchMock = stubPages();
    await useSizingStore.getState().goToSamplePage(1);

    await useSizingStore.getState().setSampleBrandKey("moustache_men");
    await useSizingStore.getState().setSamplePath("women:top:");
    await useSizingStore.getState().setSampleSource("c1");

    const last = new URL(String(sampleRequests(fetchMock).at(-1)![0]), "http://localhost").searchParams;
    expect(last.get("brand")).toBe("moustache_men");
    expect(last.get("path")).toBe("women:top:");
    expect(last.get("source")).toBe("c1");
    expect(useSizingStore.getState().samplePage).toBe(1);

    // The unfiltered first page was read before; it must not be served for a filtered request.
    const filtered = sampleRequests(fetchMock).filter(([url]) => String(url).includes("brand=moustache_men"));
    expect(filtered.length).toBeGreaterThan(0);
    const before = sampleRequests(fetchMock).length;
    await useSizingStore.getState().setSampleSource("c1");
    expect(sampleRequests(fetchMock)).toHaveLength(before);
  });

  it("clears every filter in one read and leaves the search text alone", async () => {
    const fetchMock = stubPages();
    useSizingStore.setState({
      sampleBrandType: "private",
      sampleParent: "tops",
      sampleBrandKey: "moustache_men",
      samplePath: "women:",
      sampleSource: "c1",
      sampleQuery: "shirt",
    });

    await useSizingStore.getState().clearSampleFilters();

    const state = useSizingStore.getState();
    expect([state.sampleBrandType, state.sampleParent, state.sampleBrandKey, state.samplePath, state.sampleSource]).toEqual([
      null, null, null, null, null,
    ]);
    expect(state.sampleQuery).toBe("shirt");
    const params = new URL(String(sampleRequests(fetchMock)[0][0]), "http://localhost").searchParams;
    expect(params.get("q")).toBe("shirt");
    expect(params.has("brand")).toBe(false);
  });

  it("drops the filter options with the pages and reads them again", async () => {
    const options = { brands: [], paths: [], collections: [], hasCollections: true };
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(options), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    await useSizingStore.getState().loadSampleFacets();
    expect(useSizingStore.getState().sampleFacets?.hasCollections).toBe(true);

    clearSamplePages();
    expect(useSizingStore.getState().sampleFacets).toBeNull();
  });

  describe("rescanCatalog", () => {
    const pendingScan = { ...completedRun(), id: "run-new", status: "pending" as const, stage: "scan" as const };
    const json = (status: number, body: unknown) =>
      Promise.resolve(new Response(JSON.stringify(body), { status }));

    it("rewinds a run that is still open", async () => {
      const fetchMock = vi.fn((url: string) =>
        String(url).endsWith("/run/restart") ? json(200, { run: pendingScan }) : json(200, {}),
      );
      vi.stubGlobal("fetch", fetchMock);

      await useSizingStore.getState().rescanCatalog();

      expect(String(fetchMock.mock.calls[0][0])).toContain("/sizing/run/restart");
      expect(useSizingStore.getState().run?.id).toBe("run-new");
      expect(useSizingStore.getState().startingRun).toBe(false);
    });

    it("drops the Stage 4 charts it was holding so they are read again", async () => {
      useSizingStore.setState({ chartsLoaded: true });
      vi.stubGlobal(
        "fetch",
        vi.fn(() => json(200, { run: pendingScan })),
      );

      await useSizingStore.getState().rescanCatalog();

      expect(useSizingStore.getState().chartsLoaded).toBe(false);
    });

    it("starts a fresh run when the last one has finished", async () => {
      const fetchMock = vi.fn((url: string) => {
        if (String(url).endsWith("/run/restart")) return json(409, { reason: "no_live_run" });
        if (String(url).endsWith("/sizing/run")) return json(200, { run: pendingScan });
        return json(200, {});
      });
      vi.stubGlobal("fetch", fetchMock);

      await useSizingStore.getState().rescanCatalog();

      const urls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(urls.slice(0, 2)).toEqual([
        "/api/store-connection/sizing/run/restart",
        "/api/store-connection/sizing/run",
      ]);
      expect(useSizingStore.getState().run?.id).toBe("run-new");
    });

    it("surfaces a failure to start", async () => {
      const fetchMock = vi.fn((url: string) =>
        String(url).endsWith("/run/restart")
          ? json(409, { reason: "no_live_run" })
          : json(409, { error: "Approve the field mapping first" }),
      );
      vi.stubGlobal("fetch", fetchMock);

      await useSizingStore.getState().rescanCatalog();

      expect(useSizingStore.getState().runError).toBe("Approve the field mapping first");
      expect(useSizingStore.getState().startingRun).toBe(false);
    });
  });

  it("does not remember a page that still has unclassified rows", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(pageWithBrandTypes(["unclassified"])));
    vi.stubGlobal("fetch", fetchMock);

    await useSizingStore.getState().goToSamplePage(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await useSizingStore.getState().goToSamplePage(1);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
  });
});
