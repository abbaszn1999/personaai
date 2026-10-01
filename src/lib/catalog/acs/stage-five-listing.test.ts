import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AcsProduct } from "./types";

const listProducts = vi.fn();
vi.mock("./client", () => ({
  listProducts: (...args: unknown[]) => listProducts(...args),
}));

const {
  belongsToConnection,
  clearAcsStageFiveCache,
  listAcsStageFiveProducts,
  toAcsStageFiveRow,
} = await import("./stage-five-listing");

const CONNECTION_ID = "11111111-1111-1111-1111-111111111111";

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

describe("ACS Stage 5 listing", () => {
  beforeEach(() => {
    clearAcsStageFiveCache();
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

    const all = await listAcsStageFiveProducts(CONNECTION_ID, { offset: 0, limit: 25 });
    expect(all.rows.map((row) => row.type)).toEqual(["PRIMARY", "VARIANT"]);
    expect(all.counts).toEqual({
      primary: 1,
      variant: 1,
      inStock: 1,
      outOfStock: 1,
      otherAvailability: 0,
    });

    const filtered = await listAcsStageFiveProducts(CONNECTION_ID, {
      offset: 0,
      limit: 1,
      type: "VARIANT",
      availability: "OUT_OF_STOCK",
      query: "sku-1",
    });
    expect(filtered.total).toBe(1);
    expect(filtered.rows[0].id).toBe(variant.id);
    // The second query is served from the short cache rather than walking the shared catalog again.
    expect(listProducts).toHaveBeenCalledTimes(1);
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
      brandType: "private",
      brandTypes,
    });
    expect(privateRows.rows.map((row) => [row.id, row.brandType])).toEqual([
      [privateLabel.id, "private"],
    ]);

    const nullRows = await listAcsStageFiveProducts(CONNECTION_ID, {
      offset: 0,
      limit: 25,
      brandType: "none",
      brandTypes,
    });
    expect(nullRows.rows.map((row) => [row.id, row.brandType])).toEqual([
      [unbranded.id, "none"],
    ]);
  });

  it("reads every authoritative ACS page and rejects repeated tokens", async () => {
    listProducts
      .mockResolvedValueOnce({ products: [product()], nextPageToken: "page-2" })
      .mockResolvedValueOnce({
        products: [product({ id: `${CONNECTION_ID}_product-2` })],
        nextPageToken: "page-2",
      });

    await expect(
      listAcsStageFiveProducts(CONNECTION_ID, { offset: 0, limit: 25 }),
    ).rejects.toThrow("repeated catalog page token");
  });
});
