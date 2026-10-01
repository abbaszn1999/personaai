import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SizingChartRow } from "@/lib/db/sizing-charts";
import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";
import { brandSourceFingerprint } from "@/lib/sizing/brand-mapping";

vi.mock("@/modules/auth/lib/get-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/store-connections", () => ({ getStoreConnectionByOwner: vi.fn() }));
vi.mock("@/lib/db/sizing-coverage", () => ({ listSizingCoverage: vi.fn() }));
vi.mock("@/lib/db/sizing-charts", () => ({
  listSharedChartsForBrands: vi.fn(),
  listPrivateChartsForBrands: vi.fn(),
}));

import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { listSizingCoverage } from "@/lib/db/sizing-coverage";
import {
  listPrivateChartsForBrands,
  listSharedChartsForBrands,
} from "@/lib/db/sizing-charts";
import { GET } from "@/app/api/store-connection/sizing/tester/options/route";

function coverage(overrides: Partial<SizingCoverageRow> = {}): SizingCoverageRow {
  return {
    id: "coverage-1",
    connectionId: "connection-1",
    brandKey: "nike_men",
    brandName: "Nike Men",
    brandType: "global",
    brandCanonicalName: "Nike",
    sizingCategory: "tops",
    skuCount: 7,
    storeCategoryPaths: [],
    sampleSkus: [],
    rawFormats: {},
    audienceHints: {},
    researchStatus: "found",
    researchNote: null,
    updatedAt: "2026-09-29T00:00:00.000Z",
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
    coversLeaves: [],
    audience: "mens",
    sourceTitle: "Nike guide",
    chartRows: [{ size: "M", aliases: { us: "M" }, chest_min: 96, chest_max: 104 }],
    confidence: 0.97,
    sourceUrl: null,
    provenance: "research",
    version: 1,
    updatedAt: "2026-09-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("GET /api/store-connection/sizing/tester/options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue({
      id: "connection-1",
      sizingBrandMapping: {
        version: 1,
        confirmedAt: "2026-09-29T00:00:00.000Z",
        sourceFingerprint: brandSourceFingerprint(["nike_men"]),
        observed: { nike_men: ["Nike Men"] },
        aliases: {
          nike_men: {
            canonicalKey: "nike",
            canonicalName: "Nike",
            labels: ["Nike Men"],
            skuCount: 7,
            sizingCategories: ["tops"],
          },
        },
      },
    } as never);
    vi.mocked(listSizingCoverage).mockResolvedValue([
      coverage(),
      coverage({
        id: "none-coverage",
        brandKey: "",
        brandName: null,
        brandType: "none",
        brandCanonicalName: null,
        sizingCategory: "footwear",
        skuCount: 2,
      }),
    ]);
    vi.mocked(listSharedChartsForBrands).mockResolvedValue([chart()]);
    vi.mocked(listPrivateChartsForBrands).mockResolvedValue([
      chart({
        id: "none-chart",
        connectionId: "connection-1",
        brandKey: "",
        sizingCategory: "footwear",
        audience: "kids",
        chartRows: [{ size: "30", foot_length_min: 18, foot_length_max: 19 }],
        provenance: "manual",
      }),
    ]);
  });

  it("loads canonical shared charts and connection-private No brand charts", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(listSharedChartsForBrands).toHaveBeenCalledWith(["nike"]);
    expect(listPrivateChartsForBrands).toHaveBeenCalledWith("connection-1", [""]);
    expect(await response.json()).toMatchObject({
      brands: [
        { id: "nike", name: "Nike", type: "global", skuCount: 7 },
        { id: "no-brand", name: "No brand", type: "private", skuCount: 2 },
      ],
    });
  });

  it("requires authentication", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(listSizingCoverage).not.toHaveBeenCalled();
  });

  it("blocks stale canonical mapping before loading charts", async () => {
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue({
      id: "connection-1",
      sizingBrandMapping: null,
    } as never);

    const response = await GET();

    expect(response.status).toBe(409);
    expect(listSharedChartsForBrands).not.toHaveBeenCalled();
    expect(listPrivateChartsForBrands).not.toHaveBeenCalled();
  });
});
