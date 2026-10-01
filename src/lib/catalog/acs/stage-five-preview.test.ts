import { beforeEach, describe, expect, it, vi } from "vitest";

const listSizingProductRecordsPage = vi.fn();
vi.mock("@/lib/db/sizing-product-records", () => ({
  listSizingProductRecordsPage: (...args: unknown[]) => listSizingProductRecordsPage(...args),
}));

const fetchByIds = vi.fn();
vi.mock("@/lib/catalog/pager", () => ({
  createCatalogPager: vi.fn(async () => ({ fetchByIds })),
}));

vi.mock("@/lib/catalog/index-product", () => ({
  resolveCategoryPaths: vi.fn(() => [["persona", "men", "top", "shirt"]]),
  resolveGarmentCategory: vi.fn(() => ({ garmentCategory: "tops", garmentSubcategory: "shirt" })),
}));
const sizingForRawProduct = vi.fn(() => null as {
  chartKey: string;
} | null);
const loadSizingResolutionContext = vi.fn();
vi.mock("@/lib/catalog/sizing-for-product", () => ({ sizingForRawProduct }));
vi.mock("@/lib/sizing/product-chart", () => ({ loadSizingResolutionContext }));
vi.mock("./map-product", () => ({
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
  clearGeneratedStageFiveCache,
  listGeneratedAcsStageFiveProducts,
  summarizeGeneratedSizing,
} = await import("./stage-five-preview");

const connection = {
  id: "conn",
  acsFieldMapping: {},
  sizingBrandMapping: null,
  storeSizeSettings: null,
} as never;

describe("generated Stage 5 ACS preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGeneratedStageFiveCache();
    sizingForRawProduct.mockReturnValue(null);
    loadSizingResolutionContext.mockResolvedValue({ brandMappingCurrent: true });
    listSizingProductRecordsPage.mockResolvedValue({
      records: [{ externalId: "product-1" }, { externalId: "product-2" }],
      total: 2,
    });
    fetchByIds.mockResolvedValue([
      { externalId: "product-1", title: "Shirt One" },
      { externalId: "product-2", title: "Shirt Two" },
    ]);
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
    expect(listSizingProductRecordsPage).toHaveBeenCalledWith("conn", {
      offset: 0,
      limit: 250,
    });
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

  it("splits a 500-product preview page into Shopify-safe id batches", async () => {
    const records = Array.from({ length: 500 }, (_, index) => ({
      externalId: `product-${index + 1}`,
    }));
    listSizingProductRecordsPage.mockResolvedValue({ records, total: 500 });
    fetchByIds.mockImplementation(async (ids: string[]) =>
      ids.map((externalId) => ({ externalId, title: externalId })),
    );

    const result = await listGeneratedAcsStageFiveProducts(connection, {
      offset: 0,
      limit: 500,
    });

    expect(fetchByIds).toHaveBeenCalledTimes(2);
    expect(fetchByIds.mock.calls.map(([ids]) => (ids as string[]).length)).toEqual([250, 250]);
    expect(result.total).toBe(1_000);
    expect(result.pageProductCount).toBe(250);
    expect(result.rows).toHaveLength(500);
    expect(result.rows[0].id).toBe("conn_product-1");
    expect(result.rows.at(-1)?.id).toBe("conn_product-250::variant-1");
  });

  it("summarizes sizing from live products when the persisted snapshot is legacy", async () => {
    listSizingProductRecordsPage.mockResolvedValue({
      records: [{ externalId: "product-1" }, { externalId: "product-2" }],
      total: 2,
    });
    loadSizingResolutionContext.mockResolvedValue({ brandMappingCurrent: true });
    sizingForRawProduct
      .mockReturnValueOnce({ chartKey: "acme|tops|men|alpha|v1" })
      .mockReturnValueOnce(null);

    const result = await summarizeGeneratedSizing(connection);

    expect(result).toMatchObject({
      total: 2,
      variantCount: 2,
      matched: 1,
      chartKeys: ["acme|tops|men|alpha|v1"],
      canonicalBrandKeys: ["acme"],
      brandMappingCurrent: true,
    });
  });
});
