import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueuedMessage } from "@/lib/db/catalog-queue";
import type { RawCatalogProduct } from "./sync-types";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SECRET_KEY ??= "test-key";

const readCatalogMessages = vi.fn();
const ackCatalogMessages = vi.fn();
const archiveCatalogMessages = vi.fn();
const getCatalogQueueDepth = vi.fn();

vi.mock("@/lib/db/catalog-queue", () => ({
  readCatalogMessages: (...args: unknown[]) => readCatalogMessages(...args),
  ackCatalogMessages: (...args: unknown[]) => ackCatalogMessages(...args),
  archiveCatalogMessages: (...args: unknown[]) => archiveCatalogMessages(...args),
  getCatalogQueueDepth: () => getCatalogQueueDepth(),
}));

const syncProductsToAcs = vi.fn();

vi.mock("@/lib/catalog/acs/sync", () => ({
  syncProductsToAcs: (...args: unknown[]) => syncProductsToAcs(...args),
}));

const deleteProduct = vi.fn();
vi.mock("@/lib/catalog/acs/client", () => ({
  deleteProduct: (...args: unknown[]) => deleteProduct(...args),
  listProducts: vi.fn(),
}));

const getStoreConnectionById = vi.fn();
const updateCatalogSyncState = vi.fn();
const listConnectionsBySyncStatus = vi.fn();

vi.mock("@/lib/db/store-connections", () => ({
  getStoreConnectionById: (...args: unknown[]) => getStoreConnectionById(...args),
  updateCatalogSyncState: (...args: unknown[]) => updateCatalogSyncState(...args),
  listConnectionsBySyncStatus: (...args: unknown[]) => listConnectionsBySyncStatus(...args),
}));

const getActiveSizingRun = vi.fn(
  async (connectionId: string): Promise<{ id: string; stage: string } | null> => {
    void connectionId;
    return null;
  },
);
const listActivePublishingSizingRuns = vi.fn(async () => [] as Array<{
  id: string;
  connectionId: string;
  stage: string;
  status: string;
}>);
const updateSizingRun = vi.fn(async (runId: string, patch: unknown) => {
  void runId;
  void patch;
  return null;
});
const retireStaleAcsProducts = vi.fn(async (connectionId: string, runId: string) => {
  void connectionId;
  void runId;
  return 0;
});
vi.mock("@/lib/catalog/acs/catalog-reads", () => ({
  retireStaleAcsProducts: (connectionId: string, runId: string) => retireStaleAcsProducts(connectionId, runId),
}));
vi.mock("@/lib/db/sizing-runs", () => ({
  getAcsPublishStampId: async () => "publish-run-1",
  getActiveSizingRun: (connectionId: string) => getActiveSizingRun(connectionId),
  listActivePublishingSizingRuns: () => listActivePublishingSizingRuns(),
  updateSizingRun: (runId: string, patch: unknown) => updateSizingRun(runId, patch),
}));

const { drainCatalogQueue, mergeSourceCategories, settleFinishedRuns } = await import("./process-queue");

const CONNECTION_ID = "11111111-1111-1111-1111-111111111111";

const connection = {
  id: CONNECTION_ID,
  platform: "shopify",
  status: "connected",
  selectedCategoryIds: ["10"],
  categories: [{ id: "10", name: "Men", productCount: 5, parentId: null }],
  personaTaxonomyScope: {
    configured: true,
    enabledDeptIds: ["men"],
    enabledLeafKeys: ["men:top:shirt"],
    customLeaves: [],
    customCategories: [],
  },
  personaCategoryMap: {
    "10": { status: "mapped", departmentId: "men", categoryId: "top", subCategory: "shirt" },
  },
  catalogSyncTotal: 10,
  catalogSyncProgress: 0,
  catalogSyncStatus: "indexing",
};

function product(externalId: string): RawCatalogProduct {
  return {
    externalId,
    productGroupId: externalId,
    sku: externalId,
    title: "Relaxed Fit Linen Shirt",
    description: "Breathable linen.",
    brand: "Aria",
    rawCategories: ["Shirts"],
    sourceCategoryIds: ["10"],
    price: 68,
    currency: "USD",
    inStock: true,
    productUrl: "https://store.example.com/p",
    imageUrl: "https://cdn.example.com/p.webp",
    images: [],
    variantOptions: {},
    customFields: {},
    updatedAt: null,
    variants: [],
  };
}

function message(msgId: number, externalId: string, readCount = 1): QueuedMessage {
  return {
    msgId,
    readCount,
    body: { connectionId: CONNECTION_ID, product: product(externalId), sourceCategoryIds: ["10"] },
  } as unknown as QueuedMessage;
}

/** One batch of work, then an empty read so the drain loop terminates. */
function queueOnce(messages: QueuedMessage[]) {
  readCatalogMessages.mockResolvedValueOnce(messages).mockResolvedValue([]);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  readCatalogMessages.mockReset();
  ackCatalogMessages.mockReset().mockResolvedValue(undefined);
  archiveCatalogMessages.mockReset().mockResolvedValue(undefined);
  getCatalogQueueDepth.mockReset().mockResolvedValue(0);
  syncProductsToAcs.mockReset().mockResolvedValue(true);
  deleteProduct.mockReset().mockResolvedValue(true);
  getStoreConnectionById.mockReset().mockResolvedValue(connection);
  updateCatalogSyncState.mockReset().mockResolvedValue(true);
  listConnectionsBySyncStatus.mockReset().mockResolvedValue([]);
  getActiveSizingRun.mockReset().mockResolvedValue(null);
  listActivePublishingSizingRuns.mockReset().mockResolvedValue([]);
  updateSizingRun.mockReset().mockResolvedValue(null);
});

describe("drainCatalogQueue — Persona mapping boundary", () => {
  it("imports only the resolved Persona category path", async () => {
    queueOnce([message(1, "p-1")]);
    await drainCatalogQueue();

    const imported = syncProductsToAcs.mock.calls[0][0] as { categoryPaths: string[][] }[];
    expect(imported[0].categoryPaths).toEqual([["persona", "men", "top", "shirt"]]);
    expect(imported[0]).not.toHaveProperty("sourceCategoryIds");
  });

  it("acknowledges an unmapped product without importing or retrying it", async () => {
    getStoreConnectionById.mockResolvedValue({ ...connection, personaCategoryMap: {} });
    queueOnce([message(1, "p-1")]);

    const result = await drainCatalogQueue();

    expect(syncProductsToAcs).toHaveBeenCalledWith([]);
    expect(ackCatalogMessages).toHaveBeenCalledWith([1]);
    expect(result).toMatchObject({ indexed: 0, failed: 0 });
  });
});

describe("drainCatalogQueue — completion boundary", () => {
  it("keeps the catalog indexing at the numeric total until the queue is empty", async () => {
    getCatalogQueueDepth.mockResolvedValue(1);
    queueOnce(Array.from({ length: 10 }, (_, index) => message(index + 1, `p-${index + 1}`)));

    await drainCatalogQueue();

    expect(readCatalogMessages).toHaveBeenCalledWith(20, 300);
    expect(updateCatalogSyncState).toHaveBeenCalledWith(CONNECTION_ID, {
      progress: 10,
      status: "indexing",
    });
    expect(updateCatalogSyncState).not.toHaveBeenCalledWith(
      CONNECTION_ID,
      expect.objectContaining({ status: "ready" }),
    );
  });
});

describe("drainCatalogQueue — disconnect races", () => {
  it("does not import a batch when the connection is removed during preparation", async () => {
    getStoreConnectionById
      .mockResolvedValueOnce(connection)
      .mockResolvedValueOnce(null);
    queueOnce([message(1, "p-1")]);

    const result = await drainCatalogQueue();

    expect(syncProductsToAcs).not.toHaveBeenCalled();
    expect(ackCatalogMessages).toHaveBeenCalledWith([1]);
    expect(result).toMatchObject({ indexed: 0, orphaned: 1 });
  });

  it("removes products imported in the final disconnect race window", async () => {
    getStoreConnectionById
      .mockResolvedValueOnce(connection)
      .mockResolvedValueOnce(connection)
      .mockResolvedValueOnce(null);
    queueOnce([message(1, "p-1")]);

    const result = await drainCatalogQueue();

    expect(syncProductsToAcs).toHaveBeenCalledOnce();
    expect(deleteProduct).toHaveBeenCalledWith(`${CONNECTION_ID}_p-1`);
    expect(result).toMatchObject({ indexed: 0, orphaned: 1 });
  });
});

describe("mergeSourceCategories", () => {
  it("keeps categories from both sides without duplicating", () => {
    expect(mergeSourceCategories(["10", "20"], ["20", "30"]).sort()).toEqual(["10", "20", "30"]);
  });
});

/**
 * A run used to end only by its counter reaching its total, so anything that left the count short
 * — a retired product, an orphaned message, two batches racing on the same increment — stranded it
 * in `indexing` permanently. That state is not cosmetic: a catalog is searchable only at `ready`.
 */
describe("settleFinishedRuns", () => {
  function stranded(patch: Record<string, unknown> = {}) {
    return { ...connection, catalogSyncProgress: 5967, catalogSyncTotal: 6026, ...patch };
  }

  it("finishes a run the queue has no work left for, short count and all", async () => {
    listConnectionsBySyncStatus.mockResolvedValue([stranded()]);
    getCatalogQueueDepth.mockResolvedValue(0);

    await expect(settleFinishedRuns()).resolves.toBe(1);
    expect(updateCatalogSyncState).toHaveBeenCalledWith(CONNECTION_ID, { status: "ready" });
  });

  it("persists Stage 5 completion only after its sizing publish settles successfully", async () => {
    listConnectionsBySyncStatus.mockResolvedValue([stranded()]);
    listActivePublishingSizingRuns.mockResolvedValue([{
      id: "run-1",
      connectionId: CONNECTION_ID,
      stage: "publish",
      status: "running",
    }]);

    await settleFinishedRuns();

    expect(updateSizingRun).toHaveBeenCalledWith("run-1", expect.objectContaining({
      status: "complete",
      phaseDone: 5967,
      phaseTotal: 6026,
      publishedAt: expect.any(String),
      error: null,
    }));
    expect(retireStaleAcsProducts).toHaveBeenCalledWith(CONNECTION_ID, "run-1");
  });

  it("recovers a publish run stranded after its catalog was already marked ready", async () => {
    listConnectionsBySyncStatus.mockResolvedValue([]);
    listActivePublishingSizingRuns.mockResolvedValue([{
      id: "run-1",
      connectionId: CONNECTION_ID,
      stage: "publish",
      status: "running",
    }]);
    getStoreConnectionById.mockResolvedValue(stranded({
      catalogSyncStatus: "ready",
      catalogSyncProgress: 6026,
    }));

    await expect(settleFinishedRuns()).resolves.toBe(1);
    expect(updateCatalogSyncState).not.toHaveBeenCalled();
    expect(updateSizingRun).toHaveBeenCalledWith("run-1", expect.objectContaining({
      status: "complete",
      publishedAt: expect.any(String),
    }));
  });

  it("does not complete a pending republish from the previous catalog's ready state", async () => {
    listConnectionsBySyncStatus.mockResolvedValue([]);
    listActivePublishingSizingRuns.mockResolvedValue([{
      id: "run-1",
      connectionId: CONNECTION_ID,
      stage: "publish",
      status: "pending",
    }]);
    getStoreConnectionById.mockResolvedValue(stranded({
      catalogSyncStatus: "ready",
      catalogSyncProgress: 6026,
    }));

    await expect(settleFinishedRuns()).resolves.toBe(0);
    expect(getStoreConnectionById).not.toHaveBeenCalled();
    expect(updateSizingRun).not.toHaveBeenCalled();
  });

  it("leaves the count alone, so the shortfall stays visible", async () => {
    listConnectionsBySyncStatus.mockResolvedValue([stranded()]);

    await settleFinishedRuns();

    // Rounding progress up to the total would report 59 products as searchable that aren't.
    expect(updateCatalogSyncState).not.toHaveBeenCalledWith(CONNECTION_ID, expect.objectContaining({ progress: 6026 }));
  });

  it("calls a run that indexed nothing a failure, not a small success", async () => {
    listConnectionsBySyncStatus.mockResolvedValue([stranded({ catalogSyncProgress: 0 })]);

    await settleFinishedRuns();

    expect(updateCatalogSyncState).toHaveBeenCalledWith(CONNECTION_ID, { status: "error" });
  });

  it("waits while the queue still holds work", async () => {
    listConnectionsBySyncStatus.mockResolvedValue([stranded()]);
    getCatalogQueueDepth.mockResolvedValue(41);

    await expect(settleFinishedRuns()).resolves.toBe(0);
    expect(updateCatalogSyncState).not.toHaveBeenCalled();
  });

  it("does not conclude a walk that hasn't enqueued yet", async () => {
    // `indexing` is claimed before the walk starts and the total recorded only once it ends, so
    // an empty queue here means the work is still coming, not that it is done.
    listConnectionsBySyncStatus.mockResolvedValue([stranded({ catalogSyncTotal: 0, catalogSyncProgress: 0 })]);

    await expect(settleFinishedRuns()).resolves.toBe(0);
    expect(updateCatalogSyncState).not.toHaveBeenCalled();
    // Cheap enough to skip the depth read entirely when nothing could be concluded anyway.
    expect(getCatalogQueueDepth).not.toHaveBeenCalled();
  });

  it("leaves the run open when the status write fails, so the next pass retries", async () => {
    listConnectionsBySyncStatus.mockResolvedValue([stranded()]);
    updateCatalogSyncState.mockResolvedValue(false);

    await expect(settleFinishedRuns()).resolves.toBe(0);
  });

  it("runs at the end of a drain that emptied the queue", async () => {
    listConnectionsBySyncStatus.mockResolvedValue([stranded()]);
    queueOnce([]);

    await drainCatalogQueue();

    expect(updateCatalogSyncState).toHaveBeenCalledWith(CONNECTION_ID, { status: "ready" });
  });
});
