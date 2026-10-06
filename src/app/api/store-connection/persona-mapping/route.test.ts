import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { EMPTY_ACS_MAPPING } from "@/lib/catalog/acs-mapping";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SECRET_KEY ??= "test-key";

vi.mock("@/modules/auth/lib/get-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/store-connections", () => ({
  getStoreConnectionByOwner: vi.fn(),
  updateStoreConnection: vi.fn(),
}));
vi.mock("@/lib/catalog/acs/catalog-reads", () => ({
  deactivateAcsCatalogForRemapping: vi.fn(),
}));
vi.mock("@/lib/db/sizing-runs", () => ({
  rewindRun: vi.fn(),
  createSizingRun: vi.fn(),
  getLastPublishedAt: vi.fn(),
  getLatestSizingRun: vi.fn(),
}));
vi.mock("@/lib/catalog/acs/stage-five-preview", () => ({
  clearGeneratedStageFiveCache: vi.fn(),
}));
vi.mock("@/lib/db/sizing-product-records", () => ({
  getSizingProductPrimaryLeafCounts: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/db/sizing-coverage", () => ({
  listSizingCoverage: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/catalog/path-config/rebuild", () => ({
  markPathConfigStale: vi.fn().mockResolvedValue(undefined),
}));

import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner, updateStoreConnection } from "@/lib/db/store-connections";
import { deactivateAcsCatalogForRemapping } from "@/lib/catalog/acs/catalog-reads";
import { createSizingRun, getLastPublishedAt, getLatestSizingRun, rewindRun } from "@/lib/db/sizing-runs";
import { clearGeneratedStageFiveCache } from "@/lib/catalog/acs/stage-five-preview";
import { markPathConfigStale } from "@/lib/catalog/path-config/rebuild";
import { getSizingProductPrimaryLeafCounts } from "@/lib/db/sizing-product-records";
import { listSizingCoverage } from "@/lib/db/sizing-coverage";
import { DELETE, GET, PUT } from "./route";

const scope = {
  configured: true,
  enabledDeptIds: ["women"],
  enabledLeafKeys: ["women:top:t-shirt"],
  customLeaves: [],
  customCategories: [],
};

function row(overrides: Partial<StoreConnectionRow> = {}): StoreConnectionRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    ownerId: "user-1",
    platform: "shopify",
    storeName: "Store",
    storeUrl: "store.myshopify.com",
    apiKeyEncrypted: null,
    status: "connected",
    selectedCategoryIds: [],
    categories: [{ id: "tees", name: "Graphic Tees", productCount: 12, parentId: null }],
    skuParentOverrides: {},
    personaTaxonomyVersion: 1,
    personaTaxonomyScope: scope,
    personaCategoryMap: {},
    personaMappingUpdatedAt: null,
    personaAutoMatchCompletedAt: null,
    storeSizeSettings: { default: "Alpha", overrides: {} },
    productCount: 12,
    syncedAt: null,
    hardRules: [],
    styleGuide: null,
    catalogSyncStatus: "idle",
    catalogSyncProgress: 0,
    catalogSyncTotal: 0,
    catalogPendingCategoryIds: [],
    acsMappingApprovedAt: null,
    acsMapperVersionApproved: null,
    acsFieldMapping: EMPTY_ACS_MAPPING,
    sizingSource: "ai_pipeline",
    sizingBrandMapping: { version: 1, confirmedAt: null, sourceFingerprint: "", observed: {}, aliases: {} },
    sizingStagesSkippedAt: null,
    acsFieldOverridesApprovedHash: null,
    cmsColumnDiscoveryStatus: "idle",
    cmsColumnDiscoveryGroupIndex: 0,
    cmsColumnDiscoveryCursor: null,
    cmsColumnDiscoveryScanned: 0,
    cmsColumnDiscoveryError: null,
    cmsColumnDiscoveryUpdatedAt: null,
    ordersAccess: null,
    storeCurrency: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Persona mapping endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "owner-1" } as never);
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue(row());
    vi.mocked(deactivateAcsCatalogForRemapping).mockResolvedValue(0);
    vi.mocked(rewindRun).mockResolvedValue(null);
    vi.mocked(getLastPublishedAt).mockResolvedValue(null);
    vi.mocked(getLatestSizingRun).mockResolvedValue(null);
    vi.mocked(createSizingRun).mockResolvedValue(null as never);
    vi.mocked(getSizingProductPrimaryLeafCounts).mockResolvedValue(null);
    vi.mocked(listSizingCoverage).mockResolvedValue([]);
  });

  it("requires authentication", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("returns exact scan counts only when every Stage 2 product has one current primary leaf", async () => {
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue(row({
      personaMappingUpdatedAt: "2026-01-01T00:00:00.000Z",
    }));
    vi.mocked(getSizingProductPrimaryLeafCounts).mockResolvedValue({
      total: 12,
      assigned: 12,
      byLeaf: { "women:top:t-shirt": 12 },
      scannedAt: "2026-01-02T00:00:00.000Z",
    });
    vi.mocked(listSizingCoverage).mockResolvedValue([{ skuCount: 12 }] as never);

    const data = await (await GET()).json();

    expect(data.scanCounts).toEqual({
      total: 12,
      byLeaf: { "women:top:t-shirt": 12 },
    });
  });

  it("persists mapping, derives the internal walk scope, and invalidates the old index", async () => {
    vi.mocked(updateStoreConnection).mockImplementation(async (_ownerId, patch) => row({
      personaTaxonomyScope: patch.personaTaxonomyScope,
      personaCategoryMap: patch.personaCategoryMap,
      personaMappingUpdatedAt: patch.personaMappingUpdatedAt,
    }));

    const request = new NextRequest("http://localhost/api/store-connection/persona-mapping", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope,
        mappings: {
          tees: { status: "mapped", departmentId: "women", categoryId: "top", subCategory: "t-shirt" },
        },
      }),
    });
    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(updateStoreConnection).toHaveBeenCalledWith("owner-1", expect.objectContaining({
      personaCategoryMap: {
        tees: expect.objectContaining({ status: "mapped", categoryId: "top" }),
      },
      catalogSyncStatus: "idle",
    }));
    expect(deactivateAcsCatalogForRemapping).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111");
    expect(rewindRun).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111", "scan");
  });

  it("rejects a mapping that stops at a category instead of an enabled leaf", async () => {
    const request = new NextRequest("http://localhost/api/store-connection/persona-mapping", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope,
        mappings: {
          tees: { status: "mapped", departmentId: "women", categoryId: "top" },
        },
      }),
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.invalidCategoryIds).toEqual(["tees"]);
    expect(updateStoreConnection).not.toHaveBeenCalled();
  });

  it("does not stamp Auto-Match completion on a manual save", async () => {
    vi.mocked(updateStoreConnection).mockImplementation(async (_ownerId, patch) => row({
      personaTaxonomyScope: patch.personaTaxonomyScope,
      personaCategoryMap: patch.personaCategoryMap,
    }));

    const request = new NextRequest("http://localhost/api/store-connection/persona-mapping", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope,
        mappings: { tees: { status: "mapped", departmentId: "women", categoryId: "top", subCategory: "t-shirt" } },
      }),
    });
    await PUT(request);

    expect(updateStoreConnection).toHaveBeenCalledWith(
      "owner-1",
      expect.not.objectContaining({ personaAutoMatchCompletedAt: expect.anything() }),
    );
  });

  it("stamps Auto-Match completion when the save is flagged as the Auto-Match run's own save", async () => {
    vi.mocked(updateStoreConnection).mockImplementation(async (_ownerId, patch) => row({
      personaTaxonomyScope: patch.personaTaxonomyScope,
      personaCategoryMap: patch.personaCategoryMap,
      personaAutoMatchCompletedAt: patch.personaAutoMatchCompletedAt ?? null,
    }));

    const request = new NextRequest("http://localhost/api/store-connection/persona-mapping", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope,
        mappings: { tees: { status: "mapped", departmentId: "women", categoryId: "top", subCategory: "t-shirt" } },
        markAutoMatchCompleted: true,
      }),
    });
    const response = await PUT(request);
    const data = await response.json();

    expect(updateStoreConnection).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({ personaAutoMatchCompletedAt: expect.any(String) }),
    );
    expect(data.autoMatchCompletedAt).toEqual(expect.any(String));
  });

  function putRequest() {
    return new NextRequest("http://localhost/api/store-connection/persona-mapping", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope,
        mappings: { tees: { status: "mapped", departmentId: "women", categoryId: "top", subCategory: "t-shirt" } },
      }),
    });
  }

  function echoPatch() {
    vi.mocked(updateStoreConnection).mockImplementation(async (_ownerId, patch) => row({
      personaTaxonomyScope: patch.personaTaxonomyScope,
      personaCategoryMap: patch.personaCategoryMap,
      personaTaxonomyVersion: patch.personaTaxonomyVersion,
      personaMappingUpdatedAt: patch.personaMappingUpdatedAt,
    }));
  }

  it("treats saving an unchanged mapping as a no-op with no side effects", async () => {
    echoPatch();
    await PUT(putRequest());
    const saved = await vi.mocked(updateStoreConnection).mock.results[0]!.value;
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "owner-1" } as never);
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue(saved);
    vi.mocked(getSizingProductPrimaryLeafCounts).mockResolvedValue(null);
    vi.mocked(listSizingCoverage).mockResolvedValue([]);

    const response = await PUT(putRequest());

    expect(response.status).toBe(200);
    expect(updateStoreConnection).not.toHaveBeenCalled();
    expect(deactivateAcsCatalogForRemapping).not.toHaveBeenCalled();
    expect(rewindRun).not.toHaveBeenCalled();
    expect(markPathConfigStale).not.toHaveBeenCalled();
    expect(clearGeneratedStageFiveCache).not.toHaveBeenCalled();
  });

  it("keeps the published catalog serving when a published store remaps", async () => {
    vi.mocked(getLastPublishedAt).mockResolvedValue("2026-09-01T00:00:00.000Z");
    echoPatch();

    const response = await PUT(putRequest());

    expect(response.status).toBe(200);
    expect(deactivateAcsCatalogForRemapping).not.toHaveBeenCalled();
    expect(updateStoreConnection).toHaveBeenCalledWith(
      "owner-1",
      expect.not.objectContaining({ catalogSyncStatus: expect.anything() }),
    );
    expect(rewindRun).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111", "scan");
    expect(clearGeneratedStageFiveCache).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111");
  });

  it("starts a fresh setup run after a remap when the previous run already finished", async () => {
    vi.mocked(getLatestSizingRun).mockResolvedValue({ id: "old-run" } as never);
    echoPatch();

    await PUT(putRequest());

    expect(createSizingRun).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111");
  });

  it("leaves the live catalog alone when a published store clears its mapping", async () => {
    vi.mocked(getLastPublishedAt).mockResolvedValue("2026-09-01T00:00:00.000Z");
    vi.mocked(updateStoreConnection).mockResolvedValue(row());

    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(deactivateAcsCatalogForRemapping).not.toHaveBeenCalled();
  });

  it("clears mappings, restores an unconfigured taxonomy scope, and unlocks Auto-Match again", async () => {
    vi.mocked(updateStoreConnection).mockImplementation(async (_ownerId, patch) => row({
      personaTaxonomyScope: patch.personaTaxonomyScope,
      personaCategoryMap: patch.personaCategoryMap,
      personaMappingUpdatedAt: patch.personaMappingUpdatedAt,
      personaAutoMatchCompletedAt: patch.personaAutoMatchCompletedAt ?? null,
    }));

    const response = await DELETE();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(updateStoreConnection).toHaveBeenCalledWith("owner-1", expect.objectContaining({
      personaTaxonomyScope: {
        configured: false,
        enabledDeptIds: [],
        enabledLeafKeys: [],
        customLeaves: [],
        customCategories: [],
      },
      personaCategoryMap: {},
      personaMappingUpdatedAt: null,
      personaAutoMatchCompletedAt: null,
    }));
    expect(data.autoMatchCompletedAt).toBeNull();
    expect(deactivateAcsCatalogForRemapping).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111");
  });
});
