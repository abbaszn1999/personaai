import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AcsProduct } from "./types";

const listProducts = vi.fn();
vi.mock("./client", () => ({
  listProducts: (...args: unknown[]) => listProducts(...args),
}));
vi.mock("@/lib/cache/snapshot-store", () => ({
  loadSnapshot: vi.fn(async () => null),
  saveSnapshot: vi.fn(async () => undefined),
}));

const {
  belongsToConnection,
  clearAcsStageFiveCache,
  listAcsStageFiveProducts,
  readConnectionCatalog,
  toAcsStageFiveRow,
} = await import("./stage-five-listing");

const CONNECTION_ID = "11111111-1111-1111-1111-111111111111";
const PUBLISHED_AT = "2026-10-01T00:00:00.000Z";

function product(overrides: Partial<AcsProduct> = {}): AcsProduct {
  return {
    id: `${CONNECTION_ID}_product-1`,
    type: "PRIMARY",
    title: "Linen Shirt",
    categories: ["persona", "persona > men > top > shirt"],
    availability: "IN_STOCK",
    brands: ["Acme"],
    sizes: ["M", "L"],
    attributes: {
      merchant_id: { text: [CONNECTION_ID] },
      sku: { text: ["SKU-1"] },
      fit_leaf: { text: ["men:top:shirt"] },
      fit_rows: { text: ['{"s":"M","chest":[94,99],"waist":[80,85]}'] },
    },
    ...overrides,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function resetServerCaches() {
  const holder = globalThis as Record<string, unknown>;
  (holder.__personaSwrCaches as Map<string, Map<string, unknown>> | undefined)?.forEach((slots) => slots.clear());
  (holder.__personaRawProducts as Map<string, unknown> | undefined)?.clear();
  (holder.__personaPreviewContext as Map<string, unknown> | undefined)?.clear();
}
describe("ACS Stage 5 listing", () => {
  beforeEach(() => {
    resetServerCaches();
    listProducts.mockReset();
  });

  it("recognizes tenant ownership from either the namespaced id or merchant attribute", () => {
    expect(belongsToConnection(product(), CONNECTION_ID)).toBe(true);
    expect(belongsToConnection(product({
      id: "legacy-id",
      attributes: { merchant_id: { text: [CONNECTION_ID] } },
    }), CONNECTION_ID)).toBe(true);
    expect(belongsToConnection(product({
      id: "other_product",
      attributes: { merchant_id: { text: ["other"] } },
    }), CONNECTION_ID)).toBe(false);
  });

  it("maps exact ACS fields without reconstructing source-store data", () => {
    expect(toAcsStageFiveRow(product())).toMatchObject({
      id: `${CONNECTION_ID}_product-1`,
      type: "PRIMARY",
      sku: "SKU-1",
      availability: "IN_STOCK",
      fitLeaf: "men:top:shirt",
      fitRows: ['{"s":"M","chest":[94,99],"waist":[80,85]}'],
    });
  });

  it("returns primary and variant records, stock counts, filters, and exact pagination", async () => {
    const parent = product();
    const variant = product({
      id: `${CONNECTION_ID}_product-1::variant-1`,
      type: "VARIANT",
      primaryProductId: parent.id,
      title: "Linen Shirt — M",
      availability: "OUT_OF_STOCK",
      sizes: ["M"],
    });
    const otherMerchant = product({
      id: "other_product",
      attributes: { merchant_id: { text: ["other"] } },
    });
    listProducts.mockResolvedValue({ products: [variant, otherMerchant, parent] });

    const all = await listAcsStageFiveProducts(CONNECTION_ID, { offset: 0, limit: 25, publishedAt: PUBLISHED_AT });
    expect(all.rows.map((row) => row.type)).toEqual(["PRIMARY", "VARIANT"]);
    expect(all.counts).toEqual({
      primary: 1,
      variant: 1,
      inStock: 1,
      outOfStock: 1,
      otherAvailability: 0,
    });
    expect(all.refreshing).toBe(false);

    const filtered = await listAcsStageFiveProducts(CONNECTION_ID, {
      offset: 0,
      limit: 1,
      type: "VARIANT",
      availability: "OUT_OF_STOCK",
      query: "sku-1",
      publishedAt: PUBLISHED_AT,
    });
    expect(filtered.total).toBe(1);
    expect(filtered.rows[0].id).toBe(variant.id);
    // The second query is served from the cached walk rather than paging the shared catalog again.
    expect(listProducts).toHaveBeenCalledTimes(1);
  });

  it("names only the fields the mirror reads", async () => {
    listProducts.mockResolvedValue({ products: [product()] });
    await listAcsStageFiveProducts(CONNECTION_ID, { offset: 0, limit: 25, publishedAt: PUBLISHED_AT });
    const readMask = (listProducts.mock.calls[0][1] as { readMask: string }).readMask;
    expect(readMask.split(",")).toEqual(expect.arrayContaining(["id", "type", "attributes", "availability"]));
    expect(readMask).not.toContain("description");
  });

  it("filters authoritative rows by the merchant's brand classification", async () => {
    const global = product({ id: `${CONNECTION_ID}_global`, brands: ["Acme"] });
    const privateLabel = product({ id: `${CONNECTION_ID}_private`, brands: ["House Label"] });
    const unbranded = product({ id: `${CONNECTION_ID}_none`, brands: [] });
    listProducts.mockResolvedValue({ products: [global, privateLabel, unbranded] });
    const brandTypes = new Map([
      ["acme", "global" as const],
      ["house_label", "private" as const],
    ]);

    const privateRows = await listAcsStageFiveProducts(CONNECTION_ID, {
      offset: 0,
      limit: 25,
      publishedAt: PUBLISHED_AT,
      brandType: "private",
      brandTypes,
    });
    expect(privateRows.rows.map((row) => [row.id, row.brandType])).toEqual([
      [privateLabel.id, "private"],
    ]);

    const nullRows = await listAcsStageFiveProducts(CONNECTION_ID, {
      offset: 0,
      limit: 25,
      publishedAt: PUBLISHED_AT,
      brandType: "none",
      brandTypes,
    });
    expect(nullRows.rows.map((row) => [row.id, row.brandType])).toEqual([
      [unbranded.id, "none"],
    ]);
  });

  it("shows the previous mirror while a new publish is read, then the new one", async () => {
    listProducts.mockResolvedValueOnce({ products: [product({ title: "Before" })] });
    await listAcsStageFiveProducts(CONNECTION_ID, { offset: 0, limit: 25, publishedAt: PUBLISHED_AT });

    listProducts.mockResolvedValueOnce({ products: [product({ title: "After" })] });
    const during = await listAcsStageFiveProducts(CONNECTION_ID, {
      offset: 0,
      limit: 25,
      publishedAt: "2026-10-02T00:00:00.000Z",
    });
    expect(during.refreshing).toBe(true);
    expect(during.rows[0].title).toBe("Before");

    await flush();
    const after = await listAcsStageFiveProducts(CONNECTION_ID, {
      offset: 0,
      limit: 25,
      publishedAt: "2026-10-02T00:00:00.000Z",
    });
    expect(after.refreshing).toBe(false);
    expect(after.rows[0].title).toBe("After");
  });

  it("refreshes behind an invalidated mirror without blanking it", async () => {
    listProducts.mockResolvedValueOnce({ products: [product({ title: "Before" })] });
    await listAcsStageFiveProducts(CONNECTION_ID, { offset: 0, limit: 25, publishedAt: PUBLISHED_AT });

    clearAcsStageFiveCache(CONNECTION_ID);
    listProducts.mockResolvedValueOnce({ products: [product({ title: "After" })] });
    const during = await listAcsStageFiveProducts(CONNECTION_ID, { offset: 0, limit: 25, publishedAt: PUBLISHED_AT });
    expect(during).toMatchObject({ refreshing: true });
    expect(during.rows[0].title).toBe("Before");

    await flush();
    const after = await listAcsStageFiveProducts(CONNECTION_ID, { offset: 0, limit: 25, publishedAt: PUBLISHED_AT });
    expect(after.rows[0].title).toBe("After");
  });

  it("seeds the mirror from a full catalog read made for another reason", async () => {
    listProducts.mockResolvedValueOnce({ products: [product({ title: "Seeded" })] });
    await readConnectionCatalog(CONNECTION_ID, { publishedAt: PUBLISHED_AT });

    const listed = await listAcsStageFiveProducts(CONNECTION_ID, { offset: 0, limit: 25, publishedAt: PUBLISHED_AT });
    expect(listed.rows[0].title).toBe("Seeded");
    expect(listProducts).toHaveBeenCalledTimes(1);
  });

  it("reads every authoritative ACS page and rejects repeated tokens", async () => {
    listProducts
      .mockResolvedValueOnce({ products: [product()], nextPageToken: "page-2" })
      .mockResolvedValueOnce({
        products: [product({ id: `${CONNECTION_ID}_product-2` })],
        nextPageToken: "page-2",
      });

    await expect(
      listAcsStageFiveProducts(CONNECTION_ID, { offset: 0, limit: 25, publishedAt: PUBLISHED_AT }),
    ).rejects.toThrow("repeated catalog page token");
  });
});
