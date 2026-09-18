import { describe, expect, it, vi } from "vitest";
import { pageUnbrandedProducts, type UnbrandedPage } from "@/lib/sizing/unbranded-page";
import type { SizingNullRecordRow } from "@/lib/db/sizing-null-records";
import type { RawCatalogProduct } from "@/lib/catalog/sync-types";

function record(externalId: string, overrides: Partial<SizingNullRecordRow> = {}): SizingNullRecordRow {
  return {
    id: `row-${externalId}`,
    connectionId: "c1",
    externalId,
    sku: `SKU-${externalId}`,
    title: `Product ${externalId}`,
    sizingCategory: "footwear",
    ...overrides,
  };
}

function raw(externalId: string): RawCatalogProduct {
  return {
    externalId,
    productGroupId: externalId,
    sku: `SKU-${externalId}`,
    title: `Product ${externalId}`,
    description: null,
    brand: null,
    rawCategories: [],
    sourceCategoryIds: [],
    price: 10,
    currency: "USD",
    inStock: true,
    productUrl: null,
    imageUrl: null,
    images: [],
    variantOptions: {},
    customFields: {},
    updatedAt: null,
    variants: [],
  };
}

/** An index of `count` records, paged the way the database pages it. */
function index(count: number) {
  const all = Array.from({ length: count }, (_, i) => record(String(i + 1)));
  return vi.fn(async (query: { limit: number; offset: number }) => ({
    records: all.slice(query.offset, query.offset + query.limit),
    total: all.length,
  }));
}

const identity = (product: RawCatalogProduct) => product;

describe("pageUnbrandedProducts", () => {
  it("returns the index's exact total rather than the page's length", async () => {
    // The whole point: the chip says 34 and the footer has to agree, even on a page of 2.
    const page = await pageUnbrandedProducts({
      readIndex: index(34),
      fetchByIds: async (ids) => ids.map(raw),
      map: identity,
      cursor: null,
      pageSize: 2,
    });

    expect(page.total).toBe(34);
    expect(page.rows).toHaveLength(2);
  });

  it("walks the whole list across pages without repeating or skipping a product", async () => {
    const readIndex = index(5);
    const seen: string[] = [];
    let cursor: string | null = null;

    do {
      const page: UnbrandedPage<RawCatalogProduct> = await pageUnbrandedProducts({
        readIndex,
        fetchByIds: async (ids) => ids.map(raw),
        map: identity,
        cursor,
        pageSize: 2,
      });
      seen.push(...page.rows.map((row) => row.externalId));
      cursor = page.nextCursor;
    } while (cursor);

    expect(seen).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("stops rather than offering a cursor past the end of the list", async () => {
    const page = await pageUnbrandedProducts({
      readIndex: index(2),
      fetchByIds: async (ids) => ids.map(raw),
      map: identity,
      cursor: null,
      pageSize: 25,
    });

    expect(page.nextCursor).toBeNull();
  });

  it("puts the store's products back into the index's order", async () => {
    // Neither platform promises to honour the order of an id list, and paging an order other than the
    // one being offset into would show some products twice and others never.
    const page = await pageUnbrandedProducts({
      readIndex: index(3),
      fetchByIds: async (ids) => [...ids].reverse().map(raw),
      map: identity,
      cursor: null,
      pageSize: 3,
    });

    expect(page.rows.map((row) => row.externalId)).toEqual(["1", "2", "3"]);
  });

  it("drops a product the store no longer has without stalling the cursor", async () => {
    // Deleted since the scan: it should fall off the list, and the next page still has to advance —
    // an offset counted from the rows that survived would serve this same page forever.
    const page = await pageUnbrandedProducts({
      readIndex: index(5),
      fetchByIds: async (ids) => ids.filter((id) => id !== "2").map(raw),
      map: identity,
      cursor: null,
      pageSize: 2,
    });

    expect(page.rows.map((row) => row.externalId)).toEqual(["1"]);
    expect(page.nextCursor).toBe("2");
  });

  it("restarts at the top when handed a cursor from the catalog walk", async () => {
    // The two paging schemes are not interchangeable. A leftover three-part walk position must not
    // parse as an offset.
    const readIndex = index(4);
    const page = await pageUnbrandedProducts({
      readIndex,
      fetchByIds: async (ids) => ids.map(raw),
      map: identity,
      cursor: "0|0|abc",
      pageSize: 2,
    });

    expect(readIndex).toHaveBeenCalledWith(expect.objectContaining({ offset: 0 }));
    expect(page.rows.map((row) => row.externalId)).toEqual(["1", "2"]);
  });

  it("passes the parent filter and the search down to the index", async () => {
    const readIndex = index(0);
    await pageUnbrandedProducts({
      readIndex,
      fetchByIds: async () => [],
      map: identity,
      cursor: null,
      pageSize: 25,
      parent: "dresses",
      search: "blazer",
    });

    expect(readIndex).toHaveBeenCalledWith(
      expect.objectContaining({ sizingCategory: "dresses", search: "blazer" })
    );
  });

  it("asks for no filter rather than an empty one when nothing is set", async () => {
    const readIndex = index(0);
    await pageUnbrandedProducts({
      readIndex,
      fetchByIds: async () => [],
      map: identity,
      cursor: null,
      pageSize: 25,
      search: "",
    });

    expect(readIndex).toHaveBeenCalledWith(
      expect.objectContaining({ sizingCategory: null, search: null })
    );
  });

  it("does not touch the store when the index has nothing to show", async () => {
    const fetchByIds = vi.fn(async () => []);
    await pageUnbrandedProducts({
      readIndex: index(0),
      fetchByIds,
      map: identity,
      cursor: null,
      pageSize: 25,
    });

    expect(fetchByIds).toHaveBeenCalledWith([]);
  });
});
