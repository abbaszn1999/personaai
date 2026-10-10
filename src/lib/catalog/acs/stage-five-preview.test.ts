import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_ACS_MAPPING } from "@/lib/catalog/acs-mapping";

const listSizingProductRecordsPage = vi.fn();
const getSizingProductSnapshotMarker = vi.fn(async () => "2:first-id");
vi.mock("@/lib/db/sizing-product-records", () => ({
  listSizingProductRecordsPage: (...args: unknown[]) => listSizingProductRecordsPage(...args),
  getSizingProductSnapshotMarker: () => getSizingProductSnapshotMarker(),
}));

vi.mock("@/lib/db/sizing-runs", () => ({
  getLatestSizingRun: vi.fn(async () => ({ id: "run-1" })),
}));

vi.mock("@/lib/cache/snapshot-store", () => ({
  loadSnapshot: vi.fn(async () => null),
  saveSnapshot: vi.fn(async () => undefined),
}));

const fetchByIds = vi.fn();
vi.mock("@/lib/catalog/pager", () => ({
  createCatalogPager: vi.fn(async () => ({ fetchByIds })),
}));

vi.mock("@/lib/catalog/index-product", () => ({
  resolveCategoryPaths: vi.fn(() => [["persona", "men", "top", "shirt"]]),
  resolveGarmentCategory: vi.fn(() => ({ garmentCategory: "tops", garmentSubcategory: "shirt" })),
}));
type MockResolution = {
  sizing: { chartKey: string } | null;
  resolution: { status: string; canonicalBrandKey: string; leafKey: string | null };
};
const unresolvedResolution = (): MockResolution => ({
  sizing: null,
  resolution: { status: "no-chart", canonicalBrandKey: "acme", leafKey: "men:top:shirt" },
});
const resolveRawProductSizing = vi.fn(unresolvedResolution);
const loadSizingResolutionContext = vi.fn();
vi.mock("@/lib/catalog/sizing-for-product", () => ({ resolveRawProductSizing }));
vi.mock("@/lib/sizing/product-chart", () => ({ loadSizingResolutionContext }));
vi.mock("./map-product", () => ({
  hasProductImage: () => true,
  rawCatalogProductToAcsProducts: vi.fn((input: {
    raw: { externalId: string; title: string; brand?: string };
  }) => [
    {
      id: `conn_${input.raw.externalId}`,
      type: "PRIMARY",
      title: input.raw.title,
      brands: input.raw.brand ? [input.raw.brand] : [],
      categories: ["persona > men > top > shirt"],
      availability: "IN_STOCK",
    },
    {
      id: `conn_${input.raw.externalId}::variant-1`,
      type: "VARIANT",
      primaryProductId: `conn_${input.raw.externalId}`,
      title: `${input.raw.title} — M`,
      brands: input.raw.brand ? [input.raw.brand] : [],
      categories: ["persona > men > top > shirt"],
      availability: "OUT_OF_STOCK",
      sizes: ["M"],
    },
  ]),
}));

const {
  listGeneratedAcsStageFiveProducts,
  summarizeGeneratedSizing,
} = await import("./stage-five-preview");

const baseConnection = {
  id: "conn",
  platform: "shopify",
  storeUrl: "store.myshopify.com",
  storeCurrency: null,
  categories: [],
  personaTaxonomyScope: {},
  personaCategoryMap: {},
  acsFieldMapping: EMPTY_ACS_MAPPING,
  skuParentOverrides: {},
  sizingBrandMapping: null,
  storeSizeSettings: null,
};
const connection = baseConnection as never;

function context(overrides: Record<string, unknown> = {}) {
  return {
    brandMappingCurrent: true,
    brandTypes: new Map(),
    sharedCharts: [],
    privateCharts: [],
    ...overrides,
  };
}

/** Lets the context memo (a few seconds) lapse, as it would between two real requests. */
async function nextRequest() {
  vi.advanceTimersByTime(5_000);
  await Promise.resolve();
}

function resetServerCaches() {
  const holder = globalThis as Record<string, unknown>;
  (holder.__personaSwrCaches as Map<string, Map<string, unknown>> | undefined)?.forEach((slots) => slots.clear());
  (holder.__personaRawProducts as Map<string, unknown> | undefined)?.clear();
  (holder.__personaPreviewContext as Map<string, unknown> | undefined)?.clear();
}
describe("generated Stage 5 ACS preview", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    resetServerCaches();
    resolveRawProductSizing.mockImplementation(unresolvedResolution);
    loadSizingResolutionContext.mockResolvedValue(context());
    listSizingProductRecordsPage.mockResolvedValue({
      records: [{ externalId: "product-1" }, { externalId: "product-2" }],
      total: 2,
    });
    fetchByIds.mockImplementation(async (ids: string[]) =>
      ids.map((externalId) => ({ externalId, title: externalId === "product-1" ? "Shirt One" : "Shirt Two" })),
    );
  });

  it("expands current source products into the same PRIMARY and VARIANT row contract", async () => {
    const result = await listGeneratedAcsStageFiveProducts(connection, {
      offset: 1,
      limit: 2,
    });

    expect(result.total).toBe(4);
    expect(result.pageProductCount).toBe(1);
    expect(result.rows.map((row) => row.type)).toEqual([
      "VARIANT",
      "PRIMARY",
    ]);
    expect(result.counts).toEqual({
      primary: 1,
      variant: 1,
      inStock: 1,
      outOfStock: 1,
      otherAvailability: 0,
    });
    expect(result.refreshing).toBe(false);
  });

  it("applies the table's type and availability filters after exact payload generation", async () => {
    const result = await listGeneratedAcsStageFiveProducts(connection, {
      offset: 0,
      limit: 25,
      type: "VARIANT",
      availability: "OUT_OF_STOCK",
    });

    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((row) => row.type === "VARIANT" && row.availability === "OUT_OF_STOCK")).toBe(true);
  });

  it("passes the selected merchant brand classification into preview pagination", async () => {
    fetchByIds.mockResolvedValue([
      { externalId: "product-1", title: "House Shirt", brand: "House Label" },
      { externalId: "product-2", title: "Acme Shirt", brand: "Acme" },
    ]);

    const result = await listGeneratedAcsStageFiveProducts(connection, {
      offset: 0,
      limit: 25,
      brandKeys: ["house_label"],
    });

    expect(result.total).toBe(2);
    expect(result.rows.every((row) => row.brand === "House Label")).toBe(true);
  });

  it("reads every snapshot product in one pass and keeps snapshot order", async () => {
    const records = Array.from({ length: 500 }, (_, index) => ({
      externalId: `product-${index + 1}`,
    }));
    listSizingProductRecordsPage.mockResolvedValue({ records, total: 500 });
    fetchByIds.mockImplementation(async (ids: string[]) =>
      [...ids].reverse().map((externalId) => ({ externalId, title: externalId })),
    );

    const result = await listGeneratedAcsStageFiveProducts(connection, {
      offset: 0,
      limit: 500,
    });

    expect(fetchByIds).toHaveBeenCalledTimes(1);
    expect((fetchByIds.mock.calls[0][0] as string[]).length).toBe(500);
    expect(result.total).toBe(1_000);
    expect(result.pageProductCount).toBe(250);
    expect(result.rows[0].id).toBe("conn_product-1");
    expect(result.rows.at(-1)?.id).toBe("conn_product-250::variant-1");
  });

  it("summarizes sizing from live products", async () => {
    resolveRawProductSizing
      .mockReturnValueOnce({
        sizing: { chartKey: "acme|tops|men|alpha|v1" },
        resolution: { status: "matched", canonicalBrandKey: "acme", leafKey: "men:top:shirt" },
      })
      .mockImplementationOnce(unresolvedResolution);

    const result = await summarizeGeneratedSizing(connection);

    expect(result).toMatchObject({
      total: 2,
      variantCount: 2,
      matched: 1,
      unresolved: 1,
      excluded: 0,
      unavailable: 0,
      byStatus: { matched: 1, "no-chart": 1 },
      chartKeys: ["acme|tops|men|alpha|v1"],
      canonicalBrandKeys: ["acme"],
      brandMappingCurrent: true,
      refreshing: false,
    });
    expect(result.unresolvedGroups).toEqual([
      {
        brandKey: "acme",
        brandName: null,
        leafKey: "men:top:shirt",
        status: "no-chart",
        count: 1,
        sampleSkus: ["Shirt Two"],
      },
    ]);
  });

  it("keeps products with no mapped Persona path out of the unresolved count", async () => {
    const { resolveCategoryPaths } = await import("@/lib/catalog/index-product");
    vi.mocked(resolveCategoryPaths).mockReturnValueOnce([]);

    const result = await summarizeGeneratedSizing(connection);

    expect(result.excluded).toBe(1);
    expect(result.unresolved).toBe(1);
  });

  it("counts scanned products the store no longer returns instead of dropping them silently", async () => {
    fetchByIds.mockResolvedValue([{ externalId: "product-1", title: "Shirt One" }]);

    const result = await summarizeGeneratedSizing(connection);

    expect(result.unavailable).toBe(1);
    expect(result.unresolved).toBe(1);
  });

  it("serves repeat requests from the snapshot without re-reading the store", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    await summarizeGeneratedSizing(connection);
    await nextRequest();
    await listGeneratedAcsStageFiveProducts(connection, { offset: 0, limit: 25 });

    expect(fetchByIds).toHaveBeenCalledTimes(1);
    expect(resolveRawProductSizing).toHaveBeenCalledTimes(2);
  });

  it("re-resolves when a chart changes, reusing the products already read", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    await summarizeGeneratedSizing(connection);
    await nextRequest();

    loadSizingResolutionContext.mockResolvedValue(context({
      privateCharts: [{ id: "chart-1", version: 1, updatedAt: "2026-10-06T00:00:00Z" }],
    }));
    resolveRawProductSizing.mockReturnValue({
      sizing: { chartKey: "acme|tops|men|alpha|v1" },
      resolution: { status: "matched", canonicalBrandKey: "acme", leafKey: "men:top:shirt" },
    });

    const result = await summarizeGeneratedSizing(connection);

    expect(result).toMatchObject({ matched: 2, unresolved: 0, refreshing: false });
    expect(fetchByIds).toHaveBeenCalledTimes(1);
  });

  it("notices a re-scan that kept its run and rebuilds from the new product list", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    await summarizeGeneratedSizing(connection);
    await nextRequest();

    getSizingProductSnapshotMarker.mockResolvedValueOnce("3:new-first-id");
    listSizingProductRecordsPage.mockResolvedValue({
      records: [{ externalId: "product-1" }, { externalId: "product-2" }, { externalId: "product-3" }],
      total: 3,
    });

    const result = await summarizeGeneratedSizing(connection);
    expect(result.total).toBe(3);
    expect(fetchByIds.mock.calls.at(-1)?.[0]).toEqual(["product-3"]);
  });

  it("makes the publish gate wait for a snapshot that reflects every input", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    await summarizeGeneratedSizing(connection);
    await nextRequest();

    loadSizingResolutionContext.mockResolvedValue(context({ brandTypes: new Map([["acme", "private"]]) }));
    resolveRawProductSizing.mockReturnValue({
      sizing: { chartKey: "acme|tops|men|alpha|v1" },
      resolution: { status: "matched", canonicalBrandKey: "acme", leafKey: "men:top:shirt" },
    });

    const gate = await summarizeGeneratedSizing(connection, { mode: "current" });
    expect(gate.unresolved).toBe(0);
  });

  it("answers from the last snapshot once it is old and refreshes the store read behind it", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    await summarizeGeneratedSizing(connection);
    vi.advanceTimersByTime(11 * 60_000);

    const stale = await summarizeGeneratedSizing(connection);
    expect(stale.refreshing).toBe(true);

    await vi.waitFor(() => expect(fetchByIds).toHaveBeenCalledTimes(2));
  });
});
