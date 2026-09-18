import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawCatalogProduct } from "./sync-types";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import type { StoreCategory } from "@/modules/store/types";

const enqueueCatalogMessages = vi.fn(async (messages: unknown[]) => messages.length);
const updateCatalogSyncState = vi.fn(async () => true);
const listWooCatalogPage = vi.fn();

vi.mock("@/lib/db/catalog-queue", () => ({
  enqueueCatalogMessages: (...args: unknown[]) => enqueueCatalogMessages(...(args as [unknown[]])),
}));

vi.mock("@/lib/db/store-connections", () => ({
  updateCatalogSyncState: () => updateCatalogSyncState(),
}));

vi.mock("@/lib/woocommerce/client", () => ({
  listWooCatalogPage: (...args: unknown[]) => listWooCatalogPage(...args),
  normalizeWordPressUrl: (url: string) => `https://${url}`,
}));

vi.mock("@/lib/shopify/client", () => ({
  listShopifyCatalogPage: vi.fn(),
  getShopifyAccessToken: vi.fn(),
  normalizeShopifyDomain: (url: string) => url,
}));

vi.mock("@/lib/utils/crypto", () => ({
  decodeCredentials: () => ({ wpUsername: "u", wpAppPassword: "p" }),
}));

// No real delay: the walk pauses between pages to be polite to a merchant's store, which would
// otherwise make this suite wait for nothing.
vi.mock("./timeout", () => ({ sleep: async () => {} }));

const { enqueueCatalogSync } = await import("./enqueue-sync");

function product(id: string, sourceCategoryIds: string[] = []): RawCatalogProduct {
  return {
    externalId: id,
    productGroupId: id,
    sku: null,
    title: `Product ${id}`,
    description: null,
    brand: null,
    rawCategories: [],
    sourceCategoryIds,
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

function categories(): StoreCategory[] {
  return [
    { id: "1", name: "Clothing", productCount: 0, parentId: null },
    { id: "2", name: "Dresses", productCount: 5, parentId: "1" },
    { id: "9", name: "Homeware", productCount: 400, parentId: null },
  ];
}

function connection(overrides: Partial<StoreConnectionRow> = {}): StoreConnectionRow {
  return {
    id: "conn-1",
    platform: "wordpress",
    storeUrl: "shop.example.com",
    apiKeyEncrypted: "enc",
    categories: categories(),
    selectedCategoryIds: ["1"],
    catalogPendingCategoryIds: [],
    ...overrides,
  } as StoreConnectionRow;
}

/**
 * Serves products keyed by category id, unioned across whatever ids the fetch asked for and
 * deduplicated — which is what WooCommerce's comma-separated `category` filter actually does.
 */
function pagesByCategory(pages: Record<string, RawCatalogProduct[]>) {
  listWooCatalogPage.mockImplementation(async (_url, _user, _pass, options) => {
    const seen = new Map<string, RawCatalogProduct>();
    for (const id of options.categoryIds as string[]) {
      for (const product of pages[id] ?? []) seen.set(product.externalId, product);
    }
    return { products: [...seen.values()], hasMore: false };
  });
}

/** The category id sets the walk actually asked the store for. */
function requestedGroups() {
  return listWooCatalogPage.mock.calls.map((call) => (call[3].categoryIds as string[]).join(","));
}

function enqueuedMessages() {
  return enqueueCatalogMessages.mock.calls.flatMap((call) => call[0] as Array<{ product: RawCatalogProduct; sourceCategoryIds: string[] }>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enqueueCatalogSync", () => {
  it("asks only for the selected category and its descendants, never the rest of the store", async () => {
    pagesByCategory({ "1": [product("a", ["1"])], "2": [product("b", ["2"])], "9": [product("z", ["9"])] });

    const result = await enqueueCatalogSync(connection());

    // One request covering the subtree, and Homeware ("9") nowhere in it.
    expect(requestedGroups()).toEqual(["1,2"]);
    expect(enqueuedMessages().map((m) => m.product.externalId).sort()).toEqual(["a", "b"]);
    expect(result.enqueued).toBe(2);
  });

  it("enqueues a product filed on both a parent and its child only once", async () => {
    // The cost guarantee. Stores routinely file a product on "Women" and "Women > Clothing" both,
    // and one message per appearance would enrich and embed the same product twice.
    pagesByCategory({ "1": [product("dup", ["1", "2"])], "2": [product("dup", ["1", "2"])] });

    const result = await enqueueCatalogSync(connection());

    expect(enqueuedMessages()).toHaveLength(1);
    // Both recorded, because deselecting one must leave the product covered by the other.
    expect(enqueuedMessages()[0].sourceCategoryIds.sort()).toEqual(["1", "2"]);
    expect(result.duplicates).toBe(0);
  });

  it("counts a product as duplicate when separate groups both return it", async () => {
    // Chunking splits a large expansion across requests, so the same product can legitimately
    // arrive twice. It still has to be enqueued once.
    const wide: StoreCategory[] = [
      { id: "1", name: "Clothing", productCount: 0, parentId: null },
      ...Array.from({ length: 45 }, (_, i) => ({
        id: `c${i}`,
        name: `Child ${i}`,
        productCount: 1,
        parentId: "1",
      })),
    ];
    const shared = product("shared", ["1"]);
    listWooCatalogPage.mockImplementation(async () => ({ products: [shared], hasMore: false }));

    const result = await enqueueCatalogSync(connection({ categories: wide, selectedCategoryIds: ["1"] }));

    // 46 terms chunked at 40 means two requests, both returning the same product.
    expect(requestedGroups()).toHaveLength(2);
    expect(enqueuedMessages()).toHaveLength(1);
    expect(result.duplicates).toBe(1);
  });

  it("records the walked category even when the product does not report it", async () => {
    // Shopify caps how many collections a product reports, so a product in more collections than
    // that comes back from a collection it appears not to belong to. Trusting the payload alone
    // would index it and then treat it as out of scope, making it invisible. Only safe for a
    // single-category request, where the match is unambiguous.
    pagesByCategory({ "1": [product("p", ["77", "88"])] });

    await enqueueCatalogSync(connection({ selectedCategoryIds: ["1"], categories: [categories()[0]] }));

    expect(requestedGroups()).toEqual(["1"]);
    expect(enqueuedMessages()[0].sourceCategoryIds.sort()).toEqual(["1", "77", "88"]);
  });

  it("does not invent membership for a multi-category request", async () => {
    // "b" is only in category 2. Claiming it for category 1 as well would keep it alive through a
    // deselection of 2 that should have removed it.
    pagesByCategory({ "1": [product("a", ["1"])], "2": [product("b", ["2"])] });

    await enqueueCatalogSync(connection());

    const b = enqueuedMessages().find((m) => m.product.externalId === "b")!;
    expect(b.sourceCategoryIds).toEqual(["2"]);
  });

  it("enqueues nothing when no category is selected", async () => {
    pagesByCategory({ "1": [product("a", ["1"])] });

    const result = await enqueueCatalogSync(connection({ selectedCategoryIds: [] }));

    expect(listWooCatalogPage).not.toHaveBeenCalled();
    expect(result.enqueued).toBe(0);
  });

  it("walks only the named categories when given an increment", async () => {
    pagesByCategory({ "1": [product("a", ["1"])], "2": [product("b", ["2"])], "9": [product("z", ["9"])] });

    await enqueueCatalogSync(connection({ selectedCategoryIds: ["1", "9"] }), { onlyCategoryIds: ["9"] });

    expect(requestedGroups()).toEqual(["9"]);
  });
});
