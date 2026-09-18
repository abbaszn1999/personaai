import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "./route";
import type { SizingChartRow } from "@/lib/db/sizing-charts";
import type { SizingChartAssignmentRow } from "@/lib/db/sizing-chart-assignments";
import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";
import type { SizingPathCoverageRow } from "@/lib/db/sizing-path-coverage";
import type { StoreConnectionRow } from "@/lib/db/store-connections";

vi.mock("@/modules/auth/lib/get-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/store-connections", () => ({ getStoreConnectionByOwner: vi.fn() }));
vi.mock("@/lib/db/sizing-coverage", () => ({ listSizingCoverage: vi.fn() }));
vi.mock("@/lib/db/sizing-charts", () => ({ listChartsForBrands: vi.fn() }));
vi.mock("@/lib/db/sizing-path-coverage", () => ({ listSizingPathCoverage: vi.fn() }));
vi.mock("@/lib/db/sizing-chart-assignments", () => ({
  insertAutoAssignments: vi.fn(),
  listSizingChartAssignments: vi.fn(),
  upsertSizingChartAssignment: vi.fn(),
}));

import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { listSizingCoverage } from "@/lib/db/sizing-coverage";
import { listChartsForBrands } from "@/lib/db/sizing-charts";
import { listSizingPathCoverage } from "@/lib/db/sizing-path-coverage";
import {
  insertAutoAssignments,
  listSizingChartAssignments,
  upsertSizingChartAssignment,
} from "@/lib/db/sizing-chart-assignments";

function pathRow(overrides: Partial<SizingPathCoverageRow> = {}): SizingPathCoverageRow {
  return {
    id: "path-1",
    connectionId: "conn-1",
    brandKey: "nike",
    brandName: "Nike",
    categoryId: "2",
    categoryPath: ["Men", "T-Shirts"],
    sizingCategory: "tops",
    skuCount: 40,
    ...overrides,
  };
}

function coverage(overrides: Partial<SizingCoverageRow> = {}): SizingCoverageRow {
  return {
    id: "cov-1",
    connectionId: "conn-1",
    brandKey: "nike",
    brandName: "Nike",
    brandType: "global",
    brandCanonicalName: null,
    sizingCategory: "tops",
    skuCount: 40,
    storeCategoryPaths: [["Men", "T-Shirts"]],
    sampleSkus: [],
    rawFormats: {},
    audienceHints: {},
    researchStatus: "found",
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

function assignment(overrides: Partial<SizingChartAssignmentRow> = {}): SizingChartAssignmentRow {
  return {
    id: "assign-1",
    connectionId: "conn-1",
    brandKey: "nike",
    categoryId: "2",
    sizingCategory: "tops",
    variantName: "Men",
    source: "merchant",
    ...overrides,
  };
}

function patch(body: unknown): Request {
  return new Request("http://localhost/api/store-connection/sizing/assignments", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as never);
  vi.mocked(getStoreConnectionByOwner).mockResolvedValue({ id: "conn-1" } as StoreConnectionRow);
  vi.mocked(listSizingPathCoverage).mockResolvedValue([pathRow()]);
  vi.mocked(listSizingCoverage).mockResolvedValue([coverage()]);
  vi.mocked(listChartsForBrands).mockResolvedValue([]);
  vi.mocked(listSizingChartAssignments).mockResolvedValue([]);
  vi.mocked(insertAutoAssignments).mockResolvedValue(true);
  vi.mocked(upsertSizingChartAssignment).mockResolvedValue(true);
});

describe("GET /api/store-connection/sizing/assignments", () => {
  it("returns every path the scan produced, with its totals", async () => {
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.paths).toHaveLength(1);
    expect(data.totals).toMatchObject({ paths: 1, unresolved: 1, unresolvedSkus: 40 });
  });

  it("persists the safe auto-matches it applies, then re-reads them", async () => {
    // Written on read rather than by a background job: the match is a pure function over rows already
    // in hand, and doing it here means a merchant's first visit shows the obvious cases resolved rather
    // than a table of dropdowns with one option each. Persisted so the choice survives, and re-read so
    // what the merchant sees is what the table actually holds.
    vi.mocked(listChartsForBrands).mockResolvedValue([chart()]);
    vi.mocked(listSizingChartAssignments)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([assignment({ source: "auto" })]);

    const res = await GET();
    const data = await res.json();

    expect(data.autoMatched).toBe(1);
    expect(insertAutoAssignments).toHaveBeenCalledWith([
      expect.objectContaining({ brandKey: "nike", categoryId: "2", variantName: "Men", source: "auto" }),
    ]);
    expect(data.paths[0].source).toBe("auto");
    expect(data.totals.assigned).toBe(1);
  });

  it("reports the paths as unassigned when the auto-match write fails", async () => {
    // The honest state. Claiming the match in the response while nothing was stored would show a path
    // as governed that publishes with no chart.
    vi.mocked(listChartsForBrands).mockResolvedValue([chart()]);
    vi.mocked(insertAutoAssignments).mockResolvedValue(false);

    const data = await (await GET()).json();

    expect(data.paths[0].variantName).toBeNull();
    expect(data.totals.unresolved).toBe(1);
  });

  it("writes nothing when every path already has a decision", async () => {
    vi.mocked(listChartsForBrands).mockResolvedValue([chart()]);
    vi.mocked(listSizingChartAssignments).mockResolvedValue([assignment()]);

    const data = await (await GET()).json();

    expect(insertAutoAssignments).not.toHaveBeenCalled();
    expect(data.autoMatched).toBe(0);
    expect(data.paths[0].source).toBe("merchant");
  });

  it("rejects an unauthenticated read", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    expect((await GET()).status).toBe(401);
    expect(listSizingPathCoverage).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/store-connection/sizing/assignments", () => {
  it("saves a merchant choice against the path", async () => {
    vi.mocked(listChartsForBrands).mockResolvedValue([chart()]);

    const res = await PATCH(patch({ brandKey: "nike", categoryId: "2", sizingCategory: "tops", variantName: "Men" }));

    expect(res.status).toBe(200);
    expect(upsertSizingChartAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "conn-1", variantName: "Men", source: "merchant" })
    );
  });

  it("always stamps the choice as the merchant's, so auto-match can never overwrite it", async () => {
    vi.mocked(listChartsForBrands).mockResolvedValue([chart()]);

    await PATCH(
      patch({ brandKey: "nike", categoryId: "2", sizingCategory: "tops", variantName: "Men", source: "auto" })
    );

    expect(vi.mocked(upsertSizingChartAssignment).mock.calls[0][0].source).toBe("merchant");
  });

  it("accepts an explicit no-chart decision and does not go looking for a variant", async () => {
    // `null` is a real answer — the merchant deciding this path publishes nothing — and it has to be
    // distinguishable from the field being absent, or the unresolved count could never reach zero.
    const res = await PATCH(patch({ brandKey: "nike", categoryId: "2", sizingCategory: "tops", variantName: null }));

    expect(res.status).toBe(200);
    expect(listChartsForBrands).not.toHaveBeenCalled();
    expect(vi.mocked(upsertSizingChartAssignment).mock.calls[0][0].variantName).toBeNull();
  });

  it("rejects a request that omits the variant field entirely", async () => {
    const res = await PATCH(patch({ brandKey: "nike", categoryId: "2", sizingCategory: "tops" }));

    expect(res.status).toBe(400);
    expect(upsertSizingChartAssignment).not.toHaveBeenCalled();
  });

  it("rejects a sizing parent outside the five", async () => {
    const res = await PATCH(patch({ brandKey: "nike", categoryId: "2", sizingCategory: "gadgets", variantName: "Men" }));

    expect(res.status).toBe(400);
    expect(upsertSizingChartAssignment).not.toHaveBeenCalled();
  });

  it("refuses a path the scan never produced", async () => {
    // Otherwise rows accumulate that no screen shows and no resolver reads.
    const res = await PATCH(patch({ brandKey: "nike", categoryId: "999", sizingCategory: "tops", variantName: "Men" }));

    expect(res.status).toBe(409);
    expect(upsertSizingChartAssignment).not.toHaveBeenCalled();
  });

  it("refuses a variant that is not this brand's chart for this parent", async () => {
    // The check that keeps the resolver honest: without it a client could bind a path to another
    // brand's table, or to a table for a different garment, and every shopper on that path would be
    // sized against measurements unrelated to what they are buying.
    vi.mocked(listChartsForBrands).mockResolvedValue([chart({ sizingCategory: "bottoms" })]);

    const res = await PATCH(patch({ brandKey: "nike", categoryId: "2", sizingCategory: "tops", variantName: "Men" }));

    expect(res.status).toBe(409);
    expect(upsertSizingChartAssignment).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated write", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await PATCH(patch({ brandKey: "nike", categoryId: "2", sizingCategory: "tops", variantName: "Men" }));

    expect(res.status).toBe(401);
    expect(upsertSizingChartAssignment).not.toHaveBeenCalled();
  });
});
