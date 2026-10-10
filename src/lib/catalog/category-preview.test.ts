import { describe, expect, it } from "vitest";
import type { RawCatalogProduct } from "./sync-types";
import { decodePreviewCursor, encodePreviewCursor, readCategoryPreviewPage } from "./category-preview";

function product(id: string): RawCatalogProduct {
  return { externalId: id, title: `Product ${id}` } as RawCatalogProduct;
}

/** A platform that returns `rawSize` products per page and keeps only the ids `keep` accepts, the way
 *  Shopify drops drafts after reading a page. Raw cursors are page numbers. */
function fakePager(groups: string[][], total: number, rawSize: number, keep: (n: number) => boolean = () => true) {
  const fetched: Array<{ group: string[]; cursor: string | null }> = [];
  return {
    fetched,
    groups,
    async fetchPage(group: string[], cursor: string | null) {
      fetched.push({ group, cursor });
      const page = cursor ? Number(cursor) : 0;
      const base = Number(group[0]) * 100_000 + page * rawSize;
      const products: RawCatalogProduct[] = [];
      for (let i = 0; i < rawSize; i += 1) {
        const n = page * rawSize + i;
        if (n >= total) break;
        if (keep(n)) products.push(product(String(base + i)));
      }
      const hasMore = (page + 1) * rawSize < total;
      return { products, nextCursor: hasMore ? String(page + 1) : null };
    },
  };
}

async function readAll(pager: ReturnType<typeof fakePager>, pageSize: number) {
  const pages: string[][] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 100; guard += 1) {
    const result = await readCategoryPreviewPage(pager, { pageSize, cursor });
    pages.push(result.products.map((p) => p.externalId));
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  return pages;
}

describe("readCategoryPreviewPage", () => {
  it("fills a page to the requested size across several raw pages", async () => {
    const pager = fakePager([["1"]], 500, 40);
    const result = await readCategoryPreviewPage(pager, { pageSize: 100 });
    expect(result.products).toHaveLength(100);
    expect(result.nextCursor).not.toBeNull();
  });

  it("passes over products the caller leaves out, counting them, and still fills the page", async () => {
    const pager = fakePager([["1"]], 300, 40);
    const odd = (p: RawCatalogProduct) => Number(p.externalId) % 2 === 0;
    const first = await readCategoryPreviewPage(pager, { pageSize: 50, keep: odd });
    expect(first.products).toHaveLength(50);
    expect(first.products.every(odd)).toBe(true);
    expect(first.hidden).toBeGreaterThanOrEqual(49);
    const second = await readCategoryPreviewPage(pager, { pageSize: 50, cursor: first.nextCursor, keep: odd });
    const firstIds = new Set(first.products.map((p) => p.externalId));
    expect(second.products.some((p) => firstIds.has(p.externalId))).toBe(false);
  });

  it("keeps every product exactly once when raw pages split across preview pages", async () => {
    const pager = fakePager([["1"]], 250, 40);
    const pages = await readAll(pager, 100);
    const flat = pages.flat();
    expect(flat).toHaveLength(250);
    expect(new Set(flat).size).toBe(250);
    expect(pages.slice(0, -1).every((page) => page.length === 100)).toBe(true);
  });

  it("still fills pages when most of each raw page is dropped", async () => {
    const pager = fakePager([["1"]], 800, 100, (n) => n % 10 === 0);
    const pages = await readAll(pager, 25);
    const flat = pages.flat();
    expect(flat).toHaveLength(80);
    expect(new Set(flat).size).toBe(80);
    expect(pages[0]).toHaveLength(25);
  });

  it("walks the groups in turn and ends with a null cursor", async () => {
    const pager = fakePager([["1"], ["2"]], 30, 20);
    const pages = await readAll(pager, 25);
    expect(pages.flat()).toHaveLength(60);
    expect(pages.at(-1)!.length).toBeGreaterThan(0);
  });

  it("returns a short page with a cursor rather than walking forever through dropped products", async () => {
    const pager = fakePager([["1"]], 10_000, 100, () => false);
    const result = await readCategoryPreviewPage(pager, { pageSize: 25 });
    expect(result.products).toHaveLength(0);
    expect(pager.fetched.length).toBeLessThanOrEqual(8);
    expect(result.nextCursor).not.toBeNull();
  });

  it("returns an empty final page for an empty category", async () => {
    const pager = fakePager([["1"]], 0, 100);
    const result = await readCategoryPreviewPage(pager, { pageSize: 25 });
    expect(result).toEqual({ products: [], nextCursor: null, hidden: 0 });
  });
});

describe("preview cursor", () => {
  it("round-trips and rejects anything it did not write", () => {
    const cursor = encodePreviewCursor({ group: 1, raw: "abc", skip: 7 });
    expect(decodePreviewCursor(cursor)).toEqual({ group: 1, raw: "abc", skip: 7 });
    expect(decodePreviewCursor("not-a-cursor")).toBeNull();
    expect(decodePreviewCursor(null)).toBeNull();
    expect(decodePreviewCursor(Buffer.from(JSON.stringify({ group: -1, raw: null, skip: 0 })).toString("base64url"))).toBeNull();
  });
});
