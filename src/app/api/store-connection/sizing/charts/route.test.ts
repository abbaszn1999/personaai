import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";
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
  upsertPrivateChart: vi.fn(),
}));
vi.mock("@/lib/db/sizing-runs", () => ({ getLatestSizingRun: vi.fn() }));

import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { listSizingCoverage, setResearchOutcomes } from "@/lib/db/sizing-coverage";
import { upsertPrivateChart } from "@/lib/db/sizing-charts";

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

function request(brandKey: string): Request {
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
    } as unknown as StoreConnectionRow);
    vi.mocked(listSizingCoverage).mockResolvedValue([coverage()]);
    vi.mocked(upsertPrivateChart).mockResolvedValue(true);
    vi.mocked(setResearchOutcomes).mockResolvedValue(true);
  });

  it("writes a private-label chart only to the private chart writer", async () => {
    const response = await POST(request("house"));

    expect(response.status).toBe(200);
    expect(upsertPrivateChart).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "connection-1",
        brandKey: "house",
        coversLeaves: ["men:top:t-shirt"],
      }),
    );
  });

  it("writes an unbranded chart to the same isolated private table", async () => {
    vi.mocked(listSizingCoverage).mockResolvedValue([
      coverage({ brandKey: "", brandName: null, brandType: "none" }),
    ]);

    const response = await POST(request(""));

    expect(response.status).toBe(200);
    expect(upsertPrivateChart).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "connection-1", brandKey: "" }),
    );
  });

  it("refuses merchant-entered charts for global brands", async () => {
    vi.mocked(listSizingCoverage).mockResolvedValue([
      coverage({ brandKey: "nike", brandName: "Nike", brandType: "global" }),
    ]);

    const response = await POST(request("nike"));

    expect(response.status).toBe(409);
    expect(upsertPrivateChart).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: "Manual charts are only available for private-label and unbranded products.",
    });
  });
});
