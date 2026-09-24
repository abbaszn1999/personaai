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
}));

import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner, updateStoreConnection } from "@/lib/db/store-connections";
import { deactivateAcsCatalogForRemapping } from "@/lib/catalog/acs/catalog-reads";
import { rewindRun } from "@/lib/db/sizing-runs";
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
    sizingStagesSkippedAt: null,
    acsFieldOverridesApprovedHash: null,
    cmsColumnDiscoveryStatus: "idle",
    cmsColumnDiscoveryGroupIndex: 0,
    cmsColumnDiscoveryCursor: null,
    cmsColumnDiscoveryScanned: 0,
    cmsColumnDiscoveryError: null,
    cmsColumnDiscoveryUpdatedAt: null,
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
  });

  it("requires authentication", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
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
