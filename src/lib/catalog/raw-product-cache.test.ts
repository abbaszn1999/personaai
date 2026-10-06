import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import type { RawCatalogProduct } from "./sync-types";

vi.mock("@/lib/cache/snapshot-store", () => ({
  loadSnapshot: vi.fn(async () => null),
  saveSnapshot: vi.fn(async () => undefined),
}));
vi.mock("./pager", () => ({ createCatalogPager: vi.fn() }));

const { forgetRawProducts, getRawProducts } = await import("./raw-product-cache");

const fetchByIds = vi.fn();
const pager = { fetchByIds } as never;

function connection(overrides: Partial<StoreConnectionRow> = {}): StoreConnectionRow {
  return {
    id: "conn",
    platform: "shopify",
    storeUrl: "store.myshopify.com",
    storeCurrency: null,
    acsFieldMapping: { sources: {}, customAttributes: [], optionRoles: {} },
    ...overrides,
  } as unknown as StoreConnectionRow;
}

describe("raw product cache", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    (globalThis as Record<string, unknown> & { __personaRawProducts?: Map<string, unknown> })
      .__personaRawProducts?.clear();
    fetchByIds.mockImplementation(async (ids: string[]) =>
      ids.filter((id) => id !== "gone").map((externalId) => ({ externalId, title: externalId }) as RawCatalogProduct),
    );
  });

  it("reads only what it does not already hold", async () => {
    await getRawProducts(connection(), ["a", "b"], { maxAgeMs: 60_000, pager });
    const second = await getRawProducts(connection(), ["b", "c"], { maxAgeMs: 60_000, pager });

    expect(fetchByIds.mock.calls.map(([ids]) => ids)).toEqual([["a", "b"], ["c"]]);
    expect([...second.keys()]).toEqual(["b", "c"]);
  });

  it("re-reads products older than the caller allows", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    await getRawProducts(connection(), ["a"], { maxAgeMs: 60_000, pager });
    vi.advanceTimersByTime(61_000);
    await getRawProducts(connection(), ["a"], { maxAgeMs: 60_000, pager });

    expect(fetchByIds).toHaveBeenCalledTimes(2);
  });

  it("remembers a product the store no longer returns instead of asking again", async () => {
    const first = await getRawProducts(connection(), ["gone"], { maxAgeMs: 60_000, pager });
    await getRawProducts(connection(), ["gone"], { maxAgeMs: 60_000, pager });

    expect(first.size).toBe(0);
    expect(fetchByIds).toHaveBeenCalledTimes(1);
  });

  it("drops a product a webhook reported as changed", async () => {
    await getRawProducts(connection(), ["a"], { maxAgeMs: 60_000, pager });
    forgetRawProducts("conn", ["a"]);
    await getRawProducts(connection(), ["a"], { maxAgeMs: 60_000, pager });

    expect(fetchByIds).toHaveBeenCalledTimes(2);
  });

  it("starts over when a Stage 1 binding changes what a read returns", async () => {
    await getRawProducts(connection(), ["a"], { maxAgeMs: 60_000, pager });
    await getRawProducts(
      connection({
        acsFieldMapping: {
          sources: { sizeChartData: { kind: "meta", key: "metafield.custom.size_chart" } },
          customAttributes: [],
          optionRoles: {},
        } as never,
      }),
      ["a"],
      { maxAgeMs: 60_000, pager },
    );

    expect(fetchByIds).toHaveBeenCalledTimes(2);
  });
});
