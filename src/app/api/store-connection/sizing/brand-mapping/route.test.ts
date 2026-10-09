import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getStoreConnectionByOwner: vi.fn(),
  updateSizingBrandMapping: vi.fn(),
  listSizingCoverage: vi.fn(),
  listSharedChartBrandKeys: vi.fn(),
  markPathConfigStale: vi.fn(),
}));

vi.mock("@/modules/auth/lib/get-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/catalog/path-config/rebuild", () => ({ markPathConfigStale: mocks.markPathConfigStale }));
vi.mock("@/lib/db/store-connections", () => ({
  getStoreConnectionByOwner: mocks.getStoreConnectionByOwner,
  updateSizingBrandMapping: mocks.updateSizingBrandMapping,
}));
vi.mock("@/lib/db/sizing-coverage", () => ({ listSizingCoverage: mocks.listSizingCoverage }));
vi.mock("@/lib/db/sizing-charts", () => ({ listSharedChartBrandKeys: mocks.listSharedChartBrandKeys }));

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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
  mocks.getStoreConnectionByOwner.mockResolvedValue(connection);
  mocks.listSizingCoverage.mockResolvedValue(coverage);
  mocks.listSharedChartBrandKeys.mockResolvedValue([]);
  mocks.updateSizingBrandMapping.mockImplementation(async (_ownerId, mapping) => ({
    ...connection,
    sizingBrandMapping: mapping,
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

  it("saves only the mapping document without starting or rewinding a scan", async () => {
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
    expect(mocks.updateSizingBrandMapping).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
          confirmedAt: expect.any(String),
          aliases: {
            tom_tailor: expect.objectContaining({ canonicalKey: "tom_tailor" }),
            tom_tailor_men: expect.objectContaining({ canonicalKey: "tom_tailor" }),
          },
      }),
    );
    expect(mocks.updateSizingBrandMapping).toHaveBeenCalledTimes(1);
    expect(mocks.markPathConfigStale).toHaveBeenCalledWith("connection-1");
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
    expect(mocks.updateSizingBrandMapping).not.toHaveBeenCalled();
    expect(mocks.markPathConfigStale).not.toHaveBeenCalled();
  });
});
