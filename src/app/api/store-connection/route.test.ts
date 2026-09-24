import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, PATCH, sanitizeStyleGuide } from "./route";
import { STYLE_GUIDE_MAX_LENGTH } from "@/modules/store/types";
import { MAPPER_VERSION } from "@/lib/catalog/acs/map-product";
import { EMPTY_ACS_MAPPING } from "@/lib/catalog/acs-mapping";
import type { StoreConnectionRow } from "@/lib/db/store-connections";

vi.mock("@/modules/auth/lib/get-user", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/db/store-connections", () => ({
  getStoreConnectionByOwner: vi.fn(),
  upsertStoreConnection: vi.fn(),
  updateStoreConnection: vi.fn(),
  deleteStoreConnection: vi.fn(),
}));

vi.mock("@/lib/db/catalog-queue", () => ({
  purgeConnectionFromQueue: vi.fn(),
}));

vi.mock("@/lib/catalog/acs/catalog-reads", () => ({
  deleteAllAcsProductsForConnection: vi.fn(),
  pruneOutOfScopeAcsProducts: vi.fn(),
}));

import { getCurrentUser } from "@/modules/auth/lib/get-user";
import {
  deleteStoreConnection,
  getStoreConnectionByOwner,
  updateStoreConnection,
} from "@/lib/db/store-connections";
import { purgeConnectionFromQueue } from "@/lib/db/catalog-queue";
import { deleteAllAcsProductsForConnection } from "@/lib/catalog/acs/catalog-reads";

function baseRow(overrides: Partial<StoreConnectionRow> = {}): StoreConnectionRow {
  return {
    id: "conn-1",
    platform: "shopify",
    storeName: "Test Store",
    storeUrl: "test.myshopify.com",
    apiKeyEncrypted: null,
    status: "connected",
    selectedCategoryIds: [],
    categories: [],
    skuParentOverrides: {},
    personaTaxonomyVersion: 1,
    personaTaxonomyScope: { configured: false, enabledDeptIds: [], enabledLeafKeys: [], customLeaves: [], customCategories: [] },
    personaCategoryMap: {},
    personaMappingUpdatedAt: null,
    personaAutoMatchCompletedAt: null,
    storeSizeSettings: { default: "Alpha", overrides: {} },
    productCount: 0,
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

function patchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/store-connection", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("sanitizeStyleGuide", () => {
  it("trims surrounding whitespace", () => {
    expect(sanitizeStyleGuide("  lean minimalist  ")).toBe("lean minimalist");
  });

  it("strips control characters other than tab/newline/carriage-return", () => {
    const withControlChars = "lean\u0000 minimalist\u0007 style\u001F";
    expect(sanitizeStyleGuide(withControlChars)).toBe("lean minimalist style");
  });

  it("keeps tabs and newlines", () => {
    expect(sanitizeStyleGuide("line one\nline\ttwo")).toBe("line one\nline\ttwo");
  });
});

describe("PATCH /api/store-connection — styleGuide", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as never);
  });

  it("saves a trimmed, sanitized style guide", async () => {
    vi.mocked(updateStoreConnection).mockResolvedValue(
      baseRow({ styleGuide: "lean minimalist" })
    );

    const res = await PATCH(patchRequest({ styleGuide: "  lean minimalist  " }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(updateStoreConnection).toHaveBeenCalledWith("user-1", { styleGuide: "lean minimalist" });
    expect(data.styleGuide).toBe("lean minimalist");
  });

  it("clears the style guide on null", async () => {
    vi.mocked(updateStoreConnection).mockResolvedValue(baseRow({ styleGuide: null }));

    const res = await PATCH(patchRequest({ styleGuide: null }));

    expect(res.status).toBe(200);
    expect(updateStoreConnection).toHaveBeenCalledWith("user-1", { styleGuide: null });
  });

  it("clears the style guide when given an empty/whitespace-only string", async () => {
    vi.mocked(updateStoreConnection).mockResolvedValue(baseRow({ styleGuide: null }));

    const res = await PATCH(patchRequest({ styleGuide: "   " }));

    expect(res.status).toBe(200);
    expect(updateStoreConnection).toHaveBeenCalledWith("user-1", { styleGuide: null });
  });

  it("rejects a style guide over the character cap", async () => {
    const tooLong = "a".repeat(STYLE_GUIDE_MAX_LENGTH + 1);

    const res = await PATCH(patchRequest({ styleGuide: tooLong }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain(String(STYLE_GUIDE_MAX_LENGTH));
    expect(updateStoreConnection).not.toHaveBeenCalled();
  });

  it("rejects a non-string, non-null styleGuide", async () => {
    const res = await PATCH(patchRequest({ styleGuide: 42 }));

    expect(res.status).toBe(400);
    expect(updateStoreConnection).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ styleGuide: "anything" }));

    expect(res.status).toBe(401);
    expect(updateStoreConnection).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/store-connection — category cutover", () => {
  const HIERARCHY = [
    { id: "women", name: "Women", productCount: 40, parentId: null },
    { id: "women-tops", name: "Tops", productCount: 25, parentId: "women" },
    { id: "women-tees", name: "T-Shirts", productCount: 12, parentId: "women-tops" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as never);
  });

  it("rejects legacy category writes so Mapping remains the only source of truth", async () => {
    const res = await PATCH(patchRequest({
      selectedCategoryIds: ["women"],
      categoryParentMap: { women: "tops" },
      categoryTree: HIERARCHY,
    }));
    const data = await res.json();

    expect(res.status).toBe(410);
    expect(data.error).toContain("Mapping");
    expect(updateStoreConnection).not.toHaveBeenCalled();
  });

  it("still blocks a manual re-index until the mapping is approved", async () => {
    // The gate that survived the move. An unapproved merchant can pick categories all day; what they
    // cannot do is publish an index built under a mapping nobody reviewed.
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue(
      baseRow({ selectedCategoryIds: ["women"], categories: HIERARCHY, acsMappingApprovedAt: null })
    );

    const res = await PATCH(patchRequest({ reindex: true }));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.code).toBe("mapping_approval_required");
    expect(updateStoreConnection).not.toHaveBeenCalled();
  });

  it("allows a re-index once the mapping and its overrides are approved", async () => {
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue(
      baseRow({
        selectedCategoryIds: ["women"],
        categories: HIERARCHY,
        catalogSyncStatus: "ready",
        acsMappingApprovedAt: "2026-01-01T00:00:00.000Z",
        acsMapperVersionApproved: MAPPER_VERSION,
      })
    );
    vi.mocked(updateStoreConnection).mockResolvedValue(baseRow({ catalogSyncStatus: "pending" }));

    const res = await PATCH(patchRequest({ reindex: true }));

    expect(res.status).toBe(200);
    expect(vi.mocked(updateStoreConnection).mock.calls[0][1].catalogSyncStatus).toBe("pending");
  });
});

describe("DELETE /api/store-connection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue(baseRow());
    vi.mocked(updateStoreConnection).mockResolvedValue(baseRow({ status: "disconnected" }));
    vi.mocked(purgeConnectionFromQueue).mockResolvedValue(2);
    vi.mocked(deleteAllAcsProductsForConnection).mockResolvedValue(7);
    vi.mocked(deleteStoreConnection).mockResolvedValue(true);
  });

  it("stops imports and cleans ACS before deleting the connection row", async () => {
    const res = await DELETE();

    expect(res.status).toBe(200);
    expect(updateStoreConnection).toHaveBeenCalledWith("user-1", { status: "disconnected" });
    expect(purgeConnectionFromQueue).toHaveBeenCalledWith("conn-1");
    expect(deleteAllAcsProductsForConnection).toHaveBeenCalledWith("conn-1");
    expect(deleteStoreConnection).toHaveBeenCalledWith("user-1");
    expect(vi.mocked(deleteAllAcsProductsForConnection).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(deleteStoreConnection).mock.invocationCallOrder[0]);
  });

  it("keeps the connection row and restores syncing when ACS cleanup fails", async () => {
    vi.mocked(deleteAllAcsProductsForConnection).mockRejectedValue(new Error("ACS unavailable"));

    const res = await DELETE();
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toContain("ACS");
    expect(deleteStoreConnection).not.toHaveBeenCalled();
    expect(updateStoreConnection).toHaveBeenLastCalledWith("user-1", { status: "connected" });
  });
});
