import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import type { SyncNewProductRow } from "@/lib/db/sync-new-products";

vi.mock("@/lib/db/sizing-runs", () => ({
  getLatestPublishedSizingRun: vi.fn(),
  listDeltaSizingRuns: vi.fn(),
}));
vi.mock("@/lib/db/sync-new-products", () => ({
  listSyncProducts: vi.fn(),
  listSyncProductsForRuns: vi.fn(),
}));
vi.mock("@/lib/sizing/product-chart", () => ({
  loadSizingResolutionContext: vi.fn(),
  resolveProductChart: vi.fn(),
}));

import { getLatestPublishedSizingRun, listDeltaSizingRuns } from "@/lib/db/sizing-runs";
import { listSyncProducts, listSyncProductsForRuns } from "@/lib/db/sync-new-products";
import { loadSizingResolutionContext, resolveProductChart } from "@/lib/sizing/product-chart";
import { buildSyncSummary } from "./summary";

function product(overrides: Partial<SyncNewProductRow>): SyncNewProductRow {
  return {
    connectionId: "connection-1",
    externalId: "p",
    sku: null,
    title: "Product",
    imageUrl: null,
    price: null,
    brandLabel: null,
    brandKey: "nike",
    sizingCategory: "tops",
    leafKey: "men:top:t-shirt",
    rawSizeFormat: "S|M|L",
    source: "webhook",
    status: "pending",
    syncRunId: null,
    brandWasNew: null,
    chartStatus: null,
    detectedAt: "2026-10-22T10:00:00.000Z",
    updatedAt: "2026-10-22T10:00:00.000Z",
    publishedAt: null,
    ...overrides,
  };
}

const connection = { id: "connection-1" } as StoreConnectionRow;
const options = { offset: 0, limit: 20, historyOffset: 0, historyLimit: 20 };

describe("buildSyncSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLatestPublishedSizingRun).mockResolvedValue({
      id: "setup-1",
      createdAt: "2026-10-01T00:00:00.000Z",
      publishedAt: "2026-10-01T01:00:00.000Z",
      productsScanned: 600,
    } as never);
    vi.mocked(listDeltaSizingRuns).mockResolvedValue({ runs: [], total: 0 });
    vi.mocked(listSyncProductsForRuns).mockResolvedValue([]);
    vi.mocked(loadSizingResolutionContext).mockResolvedValue({
      brandTypes: new Map([["nike", "global"], ["house", "private"]]),
    } as never);
    vi.mocked(resolveProductChart).mockImplementation((input) =>
      ({ status: input.sizingCategory === "tops" ? "matched" : "no-chart" }) as never,
    );
  });

  it("places each waiting product against the store's brands and charts", async () => {
    vi.mocked(listSyncProducts).mockResolvedValue({
      rows: [
        product({ externalId: "ready" }),
        product({ externalId: "gap", sizingCategory: "bottoms" }),
        product({ externalId: "fresh", brandKey: "salomon", brandLabel: "Salomon" }),
        product({ externalId: "unsized", sizingCategory: "" }),
      ],
      total: 4,
    });

    const summary = await buildSyncSummary(connection, options);

    expect(summary.trackingActive).toBe(true);
    expect(summary.pending.counts).toEqual({ ready: 1, needs_chart: 1, new_brand: 1, no_chart_needed: 1 });
    expect(summary.pending.newBrandNames).toEqual(["Salomon"]);
    expect(summary.pending.products.map((p) => [p.externalId, p.state])).toEqual([
      ["ready", "ready"],
      ["gap", "needs_chart"],
      ["fresh", "new_brand"],
      ["unsized", "no_chart_needed"],
    ]);
  });

  it("reports what each sync did, and ends history with the Setup publish", async () => {
    vi.mocked(listSyncProducts).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(listDeltaSizingRuns).mockResolvedValue({
      runs: [
        {
          id: "sync-1",
          status: "complete",
          error: null,
          createdAt: "2026-10-22T10:00:00.000Z",
          publishedAt: "2026-10-22T10:01:30.000Z",
        },
      ] as never,
      total: 1,
    });
    vi.mocked(listSyncProductsForRuns).mockResolvedValue([
      product({ externalId: "a", status: "published", syncRunId: "sync-1", brandWasNew: true, brandKey: "salomon", chartStatus: "matched" }),
      product({ externalId: "b", status: "published", syncRunId: "sync-1", brandWasNew: false, chartStatus: "unresolved" }),
      product({ externalId: "c", status: "removed", syncRunId: "sync-1" }),
    ]);

    const summary = await buildSyncSummary(connection, options);
    const [sync, setup] = summary.history.entries;

    expect(sync).toMatchObject({
      kind: "sync",
      status: "complete",
      productCount: 2,
      publishedCount: 2,
      newBrands: 1,
      knownBrands: 1,
      durationSec: 90,
      charts: { matched: 1, unresolved: 1, unsized: 0, excluded: 0 },
    });
    expect(setup).toMatchObject({ kind: "setup", productCount: 600 });
    expect(summary.history.total).toBe(2);
    expect(summary.history.chartCoveragePercent).toBe(50);
  });

  it("is inactive before Setup has published", async () => {
    vi.mocked(getLatestPublishedSizingRun).mockResolvedValue(null);
    vi.mocked(listSyncProducts).mockResolvedValue({ rows: [], total: 0 });
    const summary = await buildSyncSummary(connection, options);
    expect(summary.trackingActive).toBe(false);
    expect(summary.history.entries).toEqual([]);
  });
});
