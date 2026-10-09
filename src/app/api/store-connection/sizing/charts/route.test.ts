import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";
import type { SizingChartRow } from "@/lib/db/sizing-charts";
import type { SizingPathCoverageRow } from "@/lib/db/sizing-path-coverage";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { POST } from "./route";

vi.mock("@/modules/auth/lib/get-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/store-connections", () => ({ getStoreConnectionByOwner: vi.fn() }));
vi.mock("@/lib/db/sizing-coverage", () => ({
  listSizingCoverage: vi.fn(),
  setResearchOutcomes: vi.fn(),
}));
vi.mock("@/lib/db/sizing-charts", () => ({
  listPrivateChartsForBrands: vi.fn(),
  listSharedChartsForBrands: vi.fn(),
  insertPrivateChart: vi.fn(),
  updatePrivateChartById: vi.fn(),
}));
vi.mock("@/lib/db/sizing-runs", () => ({ getLatestSizingRun: vi.fn() }));
vi.mock("@/lib/db/sizing-path-coverage", () => ({ listSizingPathCoverage: vi.fn() }));
vi.mock("@/lib/db/sizing-product-records", () => ({
  getSizingProductFacets: vi.fn(async () => []),
  getSizingProductPrimaryLeafCounts: vi.fn(async () => ({ byLeaf: {} })),
}));
vi.mock("@/lib/catalog/acs/stage-five-preview", () => ({ clearGeneratedStageFiveCache: vi.fn() }));

import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { listSizingCoverage, setResearchOutcomes } from "@/lib/db/sizing-coverage";
import {
  insertPrivateChart,
  listPrivateChartsForBrands,
  updatePrivateChartById,
} from "@/lib/db/sizing-charts";
import { listSizingPathCoverage } from "@/lib/db/sizing-path-coverage";
import { clearGeneratedStageFiveCache } from "@/lib/catalog/acs/stage-five-preview";

function coverage(overrides: Partial<SizingCoverageRow> = {}): SizingCoverageRow {
  return {
    id: "coverage-1",
    connectionId: "connection-1",
    brandKey: "house",
    brandName: "House",
    brandType: "private",
    brandCanonicalName: null,
    sizingCategory: "tops",
    skuCount: 4,
    storeCategoryPaths: [["Men", "Tops"]],
    sampleSkus: [],
    rawFormats: {},
    audienceHints: {},
    researchStatus: "not_found",
    researchNote: null,
    updatedAt: "2026-09-24T00:00:00.000Z",
    ...overrides,
  };
}

function existingChart(overrides: Partial<SizingChartRow> = {}): SizingChartRow {
  return {
    id: "chart-1",
    connectionId: "connection-1",
    brandKey: "house",
    sizingCategory: "tops",
    variantName: "Polos",
    coversLeaves: ["men:top:polo-shirt"],
    audience: "mens",
    sourceTitle: "Entered by hand",
    chartRows: [],
    confidence: 1,
    sourceUrl: null,
    provenance: "manual",
    version: 1,
    updatedAt: "2026-09-24T00:00:00.000Z",
    ...overrides,
  };
}

function pathRow(categoryId: string, skuCount = 3): SizingPathCoverageRow {
  return {
    id: `path-${categoryId}`,
    connectionId: "connection-1",
    brandKey: "house",
    brandName: "House",
    categoryId,
    categoryPath: ["Men"],
    sizingCategory: "tops",
    skuCount,
  };
}

function request(brandKey: string, extra: Record<string, unknown> = {}): Request {
  return new Request("http://localhost/api/store-connection/sizing/charts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandKey,
      sizingCategory: "tops",
      variantName: "Regular",
      audience: "mens",
      coversLeaves: ["men:top:t-shirt"],
      rows: [{ size: "M", values: { chest: "96-104" } }],
      ...extra,
    }),
  });
}

describe("POST /api/store-connection/sizing/charts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue({
      id: "connection-1",
      sizingBrandMapping: null,
      personaCategoryMap: null,
      personaTaxonomyScope: {
        configured: true,
        enabledLeafKeys: ["men:top:t-shirt", "men:top:polo-shirt"],
      },
    } as unknown as StoreConnectionRow);
    vi.mocked(listSizingCoverage).mockResolvedValue([coverage()]);
    vi.mocked(listPrivateChartsForBrands).mockResolvedValue([]);
    vi.mocked(listSizingPathCoverage).mockResolvedValue([pathRow("men:top:t-shirt")]);
    vi.mocked(insertPrivateChart).mockResolvedValue({ ok: true, id: "new-chart" });
    vi.mocked(updatePrivateChartById).mockResolvedValue({ ok: true, id: "chart-1" });
    vi.mocked(setResearchOutcomes).mockResolvedValue(true);
  });

  it("writes a private-label chart only to the private chart writer", async () => {
    const response = await POST(request("house"));

    expect(response.status).toBe(200);
    expect(insertPrivateChart).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "connection-1",
        brandKey: "house",
        coversLeaves: ["men:top:t-shirt"],
      }),
    );
    expect(updatePrivateChartById).not.toHaveBeenCalled();
    expect(clearGeneratedStageFiveCache).toHaveBeenCalledWith("connection-1");
  });

  it("writes an unbranded chart to the same isolated private table", async () => {
    vi.mocked(listSizingCoverage).mockResolvedValue([
      coverage({ brandKey: "", brandName: null, brandType: "none" }),
    ]);

    const response = await POST(request(""));

    expect(response.status).toBe(200);
    expect(insertPrivateChart).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "connection-1", brandKey: "" }),
    );
  });

  it("refuses merchant-entered charts for global brands", async () => {
    vi.mocked(listSizingCoverage).mockResolvedValue([
      coverage({ brandKey: "nike", brandName: "Nike", brandType: "global" }),
    ]);

    const response = await POST(request("nike"));

    expect(response.status).toBe(409);
    expect(insertPrivateChart).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: "Manual charts are only available for private-label and unbranded products.",
    });
  });

  it("marks the pair found once every stocked leaf has a chart", async () => {
    vi.mocked(listPrivateChartsForBrands).mockResolvedValueOnce([]).mockResolvedValue([
      existingChart({ id: "new-chart", coversLeaves: ["men:top:t-shirt"] }),
    ]);

    const response = await POST(request("house"));

    expect(await response.json()).toMatchObject({ ok: true, id: "new-chart", missingLeaves: [] });
    expect(setResearchOutcomes).toHaveBeenCalledWith(
      "connection-1",
      "house",
      ["tops"],
      "found",
      "Filled in by hand.",
    );
  });

  it("does not mark the pair found while another stocked leaf is still uncovered", async () => {
    vi.mocked(listSizingPathCoverage).mockResolvedValue([
      pathRow("men:top:t-shirt"),
      pathRow("men:top:polo-shirt"),
    ]);
    vi.mocked(listPrivateChartsForBrands).mockResolvedValueOnce([]).mockResolvedValue([
      existingChart({ id: "new-chart", coversLeaves: ["men:top:t-shirt"] }),
    ]);

    const response = await POST(request("house"));

    expect(await response.json()).toMatchObject({ ok: true, missingLeaves: ["men:top:polo-shirt"] });
    expect(setResearchOutcomes).not.toHaveBeenCalled();
  });

  it("updates an existing chart by id, so a rename does not create a second chart", async () => {
    vi.mocked(listPrivateChartsForBrands).mockResolvedValue([
      existingChart({ id: "chart-1", variantName: "Old name", coversLeaves: ["men:top:t-shirt"] }),
    ]);

    const response = await POST(request("house", { chartId: "chart-1", variantName: "New name" }));

    expect(response.status).toBe(200);
    expect(updatePrivateChartById).toHaveBeenCalledWith(
      "connection-1",
      "chart-1",
      expect.objectContaining({ variantName: "New name" }),
    );
    expect(insertPrivateChart).not.toHaveBeenCalled();
  });

  it("returns 404 when the chart being edited no longer exists", async () => {
    const response = await POST(request("house", { chartId: "gone" }));

    expect(response.status).toBe(404);
    expect(updatePrivateChartById).not.toHaveBeenCalled();
  });

  it("rejects a chart claiming a leaf another chart already covers in the same sizes, naming both", async () => {
    vi.mocked(listPrivateChartsForBrands).mockResolvedValue([
      existingChart({
        id: "chart-1",
        variantName: "Everyday tees",
        coversLeaves: ["men:top:t-shirt"],
        chartRows: [{ size: "M", chest_min: 93, chest_max: 98 }],
      }),
    ]);

    const response = await POST(request("house"));

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.conflictingLeaves).toEqual(["men:top:t-shirt"]);
    expect(body.error).toContain("Everyday tees");
    expect(body.error).toContain("(M)");
    expect(insertPrivateChart).not.toHaveBeenCalled();
  });

  it("treats 2XL and XXL as the same size when checking for a clash", async () => {
    vi.mocked(listPrivateChartsForBrands).mockResolvedValue([
      existingChart({ coversLeaves: ["men:top:t-shirt"], chartRows: [{ size: "XXL", chest_min: 111, chest_max: 116 }] }),
    ]);

    const response = await POST(request("house", { rows: [{ size: "2XL", values: { chest: "111-116" } }] }));

    expect(response.status).toBe(409);
  });

  it("lets a second chart cover the same leaf in a different size system", async () => {
    vi.mocked(listPrivateChartsForBrands).mockResolvedValue([
      existingChart({
        id: "chart-1",
        variantName: "Tops (EU sizes)",
        coversLeaves: ["men:top:t-shirt"],
        chartRows: [
          { size: "46", chest_min: 90, chest_max: 93 },
          { size: "48", chest_min: 94, chest_max: 97 },
        ],
      }),
    ]);

    const response = await POST(request("house"));

    expect(response.status).toBe(200);
    expect(insertPrivateChart).toHaveBeenCalledWith(
      expect.objectContaining({ coversLeaves: ["men:top:t-shirt"] }),
    );
  });

  it("allows an edit to keep the leaves it already owns", async () => {
    vi.mocked(listPrivateChartsForBrands).mockResolvedValue([
      existingChart({ id: "chart-1", coversLeaves: ["men:top:t-shirt"] }),
    ]);

    const response = await POST(request("house", { chartId: "chart-1" }));

    expect(response.status).toBe(200);
  });

  it("returns a clear 409 when the name is already taken for the brand and category", async () => {
    vi.mocked(insertPrivateChart).mockResolvedValue({ ok: false, reason: "name_conflict" });

    const response = await POST(request("house"));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('"Regular"');
    expect(setResearchOutcomes).not.toHaveBeenCalled();
  });
});
