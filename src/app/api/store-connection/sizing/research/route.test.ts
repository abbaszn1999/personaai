import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import type { SizingChartRow } from "@/lib/db/sizing-charts";
import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";
import type { SizingRunRow } from "@/lib/db/sizing-runs";
import type { StoreConnectionRow } from "@/lib/db/store-connections";

vi.mock("@/modules/auth/lib/get-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/store-connections", () => ({ getStoreConnectionByOwner: vi.fn() }));
vi.mock("@/lib/db/sizing-coverage", () => ({
  listSizingCoverage: vi.fn(),
  resetResearchOutcomes: vi.fn(),
}));
vi.mock("@/lib/db/sizing-charts", () => ({ listChartsForBrands: vi.fn() }));
vi.mock("@/lib/db/sizing-runs", () => ({
  getActiveSizingRun: vi.fn(),
  queueScopedResearch: vi.fn(),
}));

import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { listSizingCoverage, resetResearchOutcomes } from "@/lib/db/sizing-coverage";
import { listChartsForBrands } from "@/lib/db/sizing-charts";
import { getActiveSizingRun, queueScopedResearch } from "@/lib/db/sizing-runs";

/**
 * The only door into chart research, and the reason it can be a door at all.
 *
 * Research spends real web searches and writes into `sizing_charts` rows shared across every merchant,
 * so the endpoint that starts it takes a brand key straight from a browser. What is pinned here is that
 * the key is never trusted: the scope is rebuilt from this store's own coverage, and anything not in it
 * is refused rather than searched.
 */
function coverage(overrides: Partial<SizingCoverageRow> = {}): SizingCoverageRow {
  return {
    id: "cov-1",
    connectionId: "conn-1",
    brandKey: "nike",
    brandName: "Nike",
    brandType: "global",
    brandCanonicalName: null,
    sizingCategory: "tops",
    skuCount: 10,
    storeCategoryPaths: [["Clothing"]],
    sampleSkus: [],
    rawFormats: {},
    audienceHints: {},
    researchStatus: "pending",
    researchNote: null,
    updatedAt: "2026-09-14T00:00:00Z",
    ...overrides,
  };
}

function chart(overrides: Partial<SizingChartRow> = {}): SizingChartRow {
  return {
    id: "chart-1",
    connectionId: null,
    brandKey: "nike",
    sizingCategory: "tops",
    variantName: "Men",
    variantGender: "mens",
    variantFitType: null,
    audience: "mens",
    sourceTitle: "Men's Tops",
    region: "EU",
    chartRows: [{ size: "M", chest_min: 96, chest_max: 104 }],
    confidence: 0.95,
    sourceUrl: "https://nike.example/size-guide",
    provenance: "research",
    version: 1,
    updatedAt: "2026-09-14T00:00:00Z",
    ...overrides,
  };
}

function run(overrides: Partial<SizingRunRow> = {}): SizingRunRow {
  return {
    id: "run-1",
    connectionId: "conn-1",
    kind: "setup",
    status: "blocked",
    stage: "research",
    productsScanned: 100,
    phase: null,
    phaseDone: null,
    phaseTotal: null,
    researchBrandKeys: [],
    researchCurrentBrandKey: null,
    researchForce: false,
    error: null,
    publishedAt: null,
    createdAt: "2026-09-14T00:00:00Z",
    updatedAt: "2026-09-14T00:00:00Z",
    ...overrides,
  };
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/store-connection/sizing/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/store-connection/sizing/research", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue({ id: "conn-1" } as StoreConnectionRow);
    vi.mocked(getActiveSizingRun).mockResolvedValue(run());
    vi.mocked(listSizingCoverage).mockResolvedValue([coverage()]);
    vi.mocked(listChartsForBrands).mockResolvedValue([]);
    vi.mocked(resetResearchOutcomes).mockResolvedValue(true);
    vi.mocked(queueScopedResearch).mockResolvedValue(run({ status: "pending" }));
  });

  it("queues exactly the brand asked for", async () => {
    const res = await POST(post({ brandKey: "nike" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ brands: 1 });
    expect(queueScopedResearch).toHaveBeenCalledWith("conn-1", ["nike"], { force: false });
  });

  it("persists the scope on the run rather than holding it in the request", async () => {
    // A pass is bounded per tick, so a Generate All over many brands comes back through the worker
    // repeatedly. A scope living only in this request would be gone by the second tick and the worker
    // would fall back to searching everything — the exact behaviour this endpoint replaced.
    vi.mocked(listSizingCoverage).mockResolvedValue([
      coverage({ id: "a", brandKey: "nike", brandName: "Nike" }),
      coverage({ id: "b", brandKey: "adidas", brandName: "Adidas" }),
    ]);

    await POST(post({}));

    expect(queueScopedResearch).toHaveBeenCalledWith("conn-1", expect.arrayContaining(["nike", "adidas"]), {
      force: false,
    });
  });

  it("refuses a brand this store does not carry as global", async () => {
    // The scope is rebuilt from coverage, so a key invented by a client cannot reach the worker and
    // write into charts shared with every other merchant.
    const res = await POST(post({ brandKey: "gucci" }));

    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("unknown_brand");
    expect(queueScopedResearch).not.toHaveBeenCalled();
  });

  it("refuses a private label and the unbranded bucket, which publish nothing to find", async () => {
    vi.mocked(listSizingCoverage).mockResolvedValue([
      coverage({ id: "a", brandKey: "house", brandName: "House", brandType: "private" }),
      coverage({ id: "b", brandKey: "", brandName: null, brandType: "none" }),
    ]);

    expect((await POST(post({ brandKey: "house" }))).status).toBe(409);
    expect((await POST(post({ brandKey: "" }))).status).toBe(409);
    expect(queueScopedResearch).not.toHaveBeenCalled();
  });

  it("leaves finished brands out of Generate All", async () => {
    // Charts already held are not re-paid for by a bulk press. Re-searching one is what Regenerate is
    // for, per brand.
    vi.mocked(listSizingCoverage).mockResolvedValue([
      coverage({ id: "a", brandKey: "nike", brandName: "Nike", researchStatus: "found" }),
      coverage({ id: "b", brandKey: "adidas", brandName: "Adidas" }),
    ]);
    vi.mocked(listChartsForBrands).mockResolvedValue([chart()]);

    await POST(post({}));

    expect(queueScopedResearch).toHaveBeenCalledWith("conn-1", ["adidas"], { force: false });
  });

  it("says so plainly when there is nothing outstanding", async () => {
    vi.mocked(listSizingCoverage).mockResolvedValue([coverage({ researchStatus: "found" })]);
    vi.mocked(listChartsForBrands).mockResolvedValue([chart()]);

    const res = await POST(post({}));

    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("nothing_outstanding");
  });

  it("reopens recorded outcomes on a forced re-run, and keeps the old charts until new ones land", async () => {
    // Both halves matter. Without the reset, a brand recorded `not_found` is skipped by the outstanding
    // filter and Regenerate reports success having searched nothing. And unlike the re-run endpoint
    // this replaced, nothing is deleted up front — a failed search leaves the merchant with the charts
    // they already had rather than with nothing.
    vi.mocked(listSizingCoverage).mockResolvedValue([coverage({ researchStatus: "not_found" })]);

    const res = await POST(post({ brandKey: "nike", force: true }));

    expect(res.status).toBe(200);
    expect(resetResearchOutcomes).toHaveBeenCalledWith("conn-1", ["nike"]);
    expect(queueScopedResearch).toHaveBeenCalledWith("conn-1", ["nike"], { force: true });
  });

  it("waits for the catalog read to finish before it will search anything", async () => {
    // Coverage is what the scope is built from, and a scan or classification in flight has not written
    // it yet. Starting now would search an empty or unclassified brand list.
    for (const stage of ["scan", "classify"] as const) {
      vi.mocked(getActiveSizingRun).mockResolvedValue(run({ stage, status: "running" }));
      const res = await POST(post({ brandKey: "nike" }));
      expect(res.status).toBe(409);
      expect((await res.json()).reason).toBe("scan_running");
    }
    expect(queueScopedResearch).not.toHaveBeenCalled();
  });

  it("has nothing to attach research to without a live run", async () => {
    vi.mocked(getActiveSizingRun).mockResolvedValue(null);

    const res = await POST(post({ brandKey: "nike" }));

    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("no_live_run");
  });

  it("rejects an unauthenticated request before reading anything", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    expect((await POST(post({ brandKey: "nike" }))).status).toBe(401);
    expect(getStoreConnectionByOwner).not.toHaveBeenCalled();
  });
});
