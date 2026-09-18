import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import type { RawCatalogProduct } from "./sync-types";
import type { CatalogPager } from "./pager";

const updateCmsColumnDiscoveryState = vi.fn(async () => true);
const listConnectionsByCmsColumnDiscoveryStatus = vi.fn(async () => [] as StoreConnectionRow[]);
const createCatalogPager = vi.fn(async (): Promise<CatalogPager | null> => null);
const recordCmsColumnPage = vi.fn(async () => {});
const clearCmsColumns = vi.fn(async () => {});

vi.mock("@/lib/db/store-connections", () => ({
  updateCmsColumnDiscoveryState: (...args: unknown[]) => (updateCmsColumnDiscoveryState as (...a: unknown[]) => unknown)(...args),
  listConnectionsByCmsColumnDiscoveryStatus: (...args: unknown[]) =>
    (listConnectionsByCmsColumnDiscoveryStatus as (...a: unknown[]) => unknown)(...args),
}));
vi.mock("./pager", () => ({
  createCatalogPager: (...args: unknown[]) => (createCatalogPager as (...a: unknown[]) => unknown)(...args),
}));
vi.mock("./cms-column-store", () => ({
  recordCmsColumnPage: (...args: unknown[]) => (recordCmsColumnPage as (...a: unknown[]) => unknown)(...args),
  clearCmsColumns: (...args: unknown[]) => (clearCmsColumns as (...a: unknown[]) => unknown)(...args),
}));

const { runCmsColumnDiscoveryStep, startCmsColumnDiscovery } = await import("./discover-cms-columns");

function connection(overrides: Partial<StoreConnectionRow> = {}): StoreConnectionRow {
  return {
    id: "conn-1",
    platform: "shopify",
    cmsColumnDiscoveryStatus: "running",
    cmsColumnDiscoveryGroupIndex: 0,
    cmsColumnDiscoveryCursor: null,
    cmsColumnDiscoveryScanned: 0,
    cmsColumnDiscoveryError: null,
    cmsColumnDiscoveryUpdatedAt: null,
    ...overrides,
  } as StoreConnectionRow;
}

function product(overrides: Partial<RawCatalogProduct> = {}): RawCatalogProduct {
  return {
    externalId: "1",
    productGroupId: null,
    sku: "SKU-1",
    title: "Product",
    description: "",
    brand: "Acme",
    rawCategories: [],
    sourceCategoryIds: ["cat-1"],
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
    ...overrides,
  };
}

function pager(overrides: Partial<CatalogPager> = {}): CatalogPager {
  return {
    groups: [["cat-1"]],
    fetchPage: vi.fn(async () => ({ products: [], nextCursor: null })),
    countProducts: vi.fn(async () => ({ total: 0, exact: true })),
    fetchByIds: vi.fn(async () => []),
    ...overrides,
  };
}

describe("runCmsColumnDiscoveryStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finishes immediately when there is nothing in scope to walk", async () => {
    createCatalogPager.mockResolvedValue(null);

    const result = await runCmsColumnDiscoveryStep(connection());

    expect(result.outcome).toBe("finished");
    expect(updateCmsColumnDiscoveryState).toHaveBeenCalledWith("conn-1", { status: "done" });
  });

  it("advances the cursor within a group and records the page's columns", async () => {
    const fetchPage = vi.fn(async () => ({ products: [product()], nextCursor: "cursor-2" }));
    createCatalogPager.mockResolvedValue(pager({ fetchPage }));

    const result = await runCmsColumnDiscoveryStep(connection({ cmsColumnDiscoveryScanned: 5 }));

    expect(result).toEqual({ connectionId: "conn-1", outcome: "advanced", scanned: 6 });
    expect(fetchPage).toHaveBeenCalledWith(["cat-1"], null);
    expect(recordCmsColumnPage).toHaveBeenCalledTimes(1);
    expect(updateCmsColumnDiscoveryState).toHaveBeenCalledWith("conn-1", { cursor: "cursor-2", scanned: 6 });
  });

  it("moves to the next group once the current one's cursor runs out", async () => {
    const fetchPage = vi.fn(async () => ({ products: [product()], nextCursor: null }));
    createCatalogPager.mockResolvedValue(pager({ groups: [["cat-1"], ["cat-2"]], fetchPage }));

    const result = await runCmsColumnDiscoveryStep(connection());

    expect(result.outcome).toBe("advanced");
    expect(updateCmsColumnDiscoveryState).toHaveBeenCalledWith("conn-1", { groupIndex: 1, cursor: null, scanned: 1 });
  });

  it("marks the walk done once the last group's cursor runs out", async () => {
    const fetchPage = vi.fn(async () => ({ products: [product()], nextCursor: null }));
    createCatalogPager.mockResolvedValue(pager({ groups: [["cat-1"]], fetchPage }));

    const result = await runCmsColumnDiscoveryStep(connection());

    expect(result.outcome).toBe("finished");
    expect(updateCmsColumnDiscoveryState).toHaveBeenCalledWith(
      "conn-1",
      { status: "done", groupIndex: 1, cursor: null, scanned: 1 }
    );
  });

  it("finishes a walk resumed past the pager's own group count without refetching anything", async () => {
    createCatalogPager.mockResolvedValue(pager({ groups: [["cat-1"]] }));

    const result = await runCmsColumnDiscoveryStep(connection({ cmsColumnDiscoveryGroupIndex: 5 }));

    expect(result.outcome).toBe("finished");
    expect(updateCmsColumnDiscoveryState).toHaveBeenCalledWith("conn-1", { status: "done" });
  });

  it("records an error and reports failure rather than throwing when the pager blows up", async () => {
    createCatalogPager.mockRejectedValue(new Error("store API is down"));

    const result = await runCmsColumnDiscoveryStep(connection());

    expect(result.outcome).toBe("failed");
    expect(updateCmsColumnDiscoveryState).toHaveBeenCalledWith("conn-1", {
      status: "error",
      error: "store API is down",
    });
  });
});

describe("startCmsColumnDiscovery", () => {
  it("clears any prior snapshot before marking the walk running from the top", async () => {
    await startCmsColumnDiscovery(connection());

    expect(clearCmsColumns).toHaveBeenCalledWith("conn-1");
    expect(updateCmsColumnDiscoveryState).toHaveBeenCalledWith("conn-1", {
      status: "running",
      groupIndex: 0,
      cursor: null,
      scanned: 0,
      error: null,
    });
  });
});
