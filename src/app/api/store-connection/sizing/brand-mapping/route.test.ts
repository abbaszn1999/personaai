import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getStoreConnectionByOwner: vi.fn(),
  updateStoreConnection: vi.fn(),
  listSizingCoverage: vi.fn(),
  listSharedChartBrandKeys: vi.fn(),
  getLatestSizingRun: vi.fn(),
  rewindRun: vi.fn(),
  createSizingRun: vi.fn(),
}));

vi.mock("@/modules/auth/lib/get-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/store-connections", () => ({
  getStoreConnectionByOwner: mocks.getStoreConnectionByOwner,
  updateStoreConnection: mocks.updateStoreConnection,
}));
vi.mock("@/lib/db/sizing-coverage", () => ({ listSizingCoverage: mocks.listSizingCoverage }));
vi.mock("@/lib/db/sizing-charts", () => ({ listSharedChartBrandKeys: mocks.listSharedChartBrandKeys }));
vi.mock("@/lib/db/sizing-runs", () => ({
  getLatestSizingRun: mocks.getLatestSizingRun,
  rewindRun: mocks.rewindRun,
  createSizingRun: mocks.createSizingRun,
}));

const { GET, PUT } = await import("./route");

const emptyMapping = {
  version: 1 as const,
  confirmedAt: null,
  sourceFingerprint: "",
  observed: { tom_tailor_men: ["Tom Tailor Men"], tom_tailor: ["tom tailor"] },
  aliases: {},
};

const connection = {
  id: "connection-1",
  sizingBrandMapping: emptyMapping,
};

const coverage = [
  {
    brandKey: "tom_tailor_men",
    brandName: "Tom Tailor Men",
    brandType: "global",
    sizingCategory: "tops",
    skuCount: 4,
  },
  {
    brandKey: "tom_tailor",
    brandName: "tom tailor",
    brandType: "global",
    sizingCategory: "bottoms",
    skuCount: 2,
  },
];

const researchRun = {
  id: "run-1",
  stage: "research",
  status: "blocked",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
  mocks.getStoreConnectionByOwner.mockResolvedValue(connection);
  mocks.listSizingCoverage.mockResolvedValue(coverage);
  mocks.listSharedChartBrandKeys.mockResolvedValue([]);
  mocks.getLatestSizingRun.mockResolvedValue(researchRun);
  mocks.rewindRun.mockResolvedValue({ ...researchRun, stage: "scan", status: "pending" });
  mocks.createSizingRun.mockResolvedValue(null);
  mocks.updateStoreConnection.mockImplementation(async (_ownerId, patch) => ({
    ...connection,
    sizingBrandMapping: patch.sizingBrandMapping,
  }));
});

describe("brand mapping API", () => {
  it("requires authentication", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns deterministic suggestions for the merchant's global labels", async () => {
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.status).toBe("needs_mapping");
    expect(body.groups).toEqual([
      {
        canonicalKey: "tom_tailor",
        canonicalName: "tom tailor",
        rawKeys: ["tom_tailor", "tom_tailor_men"],
        shared: false,
      },
    ]);
  });

  it("saves the complete document and rewinds the catalog scan", async () => {
    const response = await PUT(
      new Request("http://localhost/api/store-connection/sizing/brand-mapping", {
        method: "PUT",
        body: JSON.stringify({
          groups: [
            {
              canonicalKey: "tom_tailor",
              canonicalName: "Tom Tailor",
              rawKeys: ["tom_tailor", "tom_tailor_men"],
              shared: false,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateStoreConnection).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        sizingBrandMapping: expect.objectContaining({
          confirmedAt: expect.any(String),
          aliases: {
            tom_tailor: expect.objectContaining({ canonicalKey: "tom_tailor" }),
            tom_tailor_men: expect.objectContaining({ canonicalKey: "tom_tailor" }),
          },
        }),
      }),
    );
    expect(mocks.rewindRun).toHaveBeenCalledWith("connection-1", "scan");
  });

  it("rejects an incomplete mapping", async () => {
    const response = await PUT(
      new Request("http://localhost/api/store-connection/sizing/brand-mapping", {
        method: "PUT",
        body: JSON.stringify({
          groups: [
            {
              canonicalKey: "tom_tailor",
              canonicalName: "Tom Tailor",
              rawKeys: ["tom_tailor"],
              shared: false,
            },
          ],
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.updateStoreConnection).not.toHaveBeenCalled();
  });
});
