import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { EMPTY_ACS_MAPPING } from "@/lib/catalog/acs-mapping";
import type { RawCatalogProduct } from "@/lib/catalog/sync-types";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SECRET_KEY ??= "test-key";

vi.mock("@/modules/auth/lib/get-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/store-connections", () => ({
  getStoreConnectionByOwner: vi.fn(),
  updateAcsFieldMapping: vi.fn(),
  updateStoreConnection: vi.fn(),
}));
vi.mock("@/lib/catalog/acs/preview", () => ({
  fetchSampleRawProducts: vi.fn(),
  fetchStoreBrandNames: vi.fn(),
}));
vi.mock("@/lib/catalog/cms-column-discovery", () => ({ fetchColumnDefinitions: vi.fn() }));
vi.mock("@/lib/catalog/cms-column-store", () => ({ getPersistedCmsColumns: vi.fn() }));
vi.mock("@/lib/db/sizing-runs", () => ({ rewindRun: vi.fn() }));

import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner, updateAcsFieldMapping } from "@/lib/db/store-connections";
import { fetchSampleRawProducts, fetchStoreBrandNames } from "@/lib/catalog/acs/preview";
import { fetchColumnDefinitions } from "@/lib/catalog/cms-column-discovery";
import { getPersistedCmsColumns } from "@/lib/catalog/cms-column-store";
import { GET, PATCH } from "./route";

function row(overrides: Partial<StoreConnectionRow> = {}): StoreConnectionRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    platform: "shopify",
    storeName: "Store",
    storeUrl: "store.myshopify.com",
    apiKeyEncrypted: null,
    status: "connected",
    selectedCategoryIds: ["cat-1"],
    categories: [],
    skuParentOverrides: {},
    personaTaxonomyVersion: 1,
    personaTaxonomyScope: { configured: true, enabledDeptIds: [], enabledLeafKeys: [], customLeaves: [], customCategories: [] },
    personaCategoryMap: {},
    personaMappingUpdatedAt: null,
    personaAutoMatchCompletedAt: null,
    storeSizeSettings: { default: "Alpha", overrides: {} },
    sizingBrandMapping: { version: 1, confirmedAt: null, sourceFingerprint: "", observed: {}, aliases: {} },
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
    ownerId: "owner-1",
    ordersAccess: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function product(overrides: Partial<RawCatalogProduct> = {}): RawCatalogProduct {
  return {
    externalId: "123",
    productGroupId: null,
    sku: "SKU-1",
    title: "Linen Shirt",
    description: "A shirt.",
    brand: "Acme",
    rawCategories: [],
    sourceCategoryIds: ["cat-1"],
    price: 59.99,
    currency: "USD",
    inStock: true,
    productUrl: null,
    imageUrl: null,
    images: [],
    variantOptions: {},
    customFields: {},
    updatedAt: null,
    variants: [],
    ...overrides,
  };
}

function patchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/store-connection/mapping-options", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("mapping-options GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "owner-1" } as never);
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue(row());
    vi.mocked(fetchSampleRawProducts).mockResolvedValue([product()]);
    vi.mocked(fetchStoreBrandNames).mockResolvedValue([]);
    vi.mocked(fetchColumnDefinitions).mockResolvedValue([]);
    vi.mocked(getPersistedCmsColumns).mockResolvedValue(new Map());
  });

  it("includes every native column even when the sample never carries it", async () => {
    const res = await GET();
    const data = await res.json();

    // Shopify's own always-fetched built-ins (see `shopify/product-columns.ts`) — none of them are
    // on the sampled product's `customFields` above, and must still show up rather than only
    // appearing once some product happens to have a value.
    const keys = data.columns.map((c: { key: string }) => c.key);
    expect(keys).toContain("meta:field.handle");
    expect(keys).toContain("meta:field.status");
  });

  it("includes every native per-variant field regardless of what the sample's products carry", async () => {
    const res = await GET();
    const data = await res.json();

    const keys = data.columns.map((c: { key: string }) => c.key);
    expect(keys).toContain("variantField:price");
    expect(keys).toContain("variantField:sku");
  });

  // The `categories` row has no CMS column behind it at all (see its own comment in
  // `acs-rows.ts`) — its sample has to come from the same Persona resolution the real index uses.
  it("resolves the categories row's sample from a sampled product's real Persona path, not a column", async () => {
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue(
      row({
        categories: [{ id: "tees", name: "Graphic Tees", productCount: 10 }],
        personaTaxonomyScope: {
          configured: true,
          enabledDeptIds: ["women"],
          enabledLeafKeys: ["women:top:t-shirt"],
          customLeaves: [],
          customCategories: [],
        },
        personaCategoryMap: {
          tees: { status: "mapped", departmentId: "women", categoryId: "top", subCategory: "t-shirt" },
        },
      })
    );
    vi.mocked(fetchSampleRawProducts).mockResolvedValue([product({ sourceCategoryIds: ["tees"] })]);

    const res = await GET();
    const data = await res.json();

    expect(data.categoriesSample).toBe("Women > Top > T-Shirts");
  });

  it("leaves the categories sample null when nothing in the sample resolves to a Persona path", async () => {
    const res = await GET();
    const data = await res.json();

    expect(data.categoriesSample).toBeNull();
  });

  it("overrides a column's presence/sample with a completed full-catalog walk's own numbers", async () => {
    vi.mocked(getPersistedCmsColumns).mockResolvedValue(
      new Map([["meta:field.handle", { presence: 480, sampled: 500, sample: "real-handle" }]])
    );

    const res = await GET();
    const data = await res.json();

    const handle = data.columns.find((c: { key: string }) => c.key === "meta:field.handle");
    expect(handle.presence).toBe(480);
    expect(handle.sampled).toBe(500);
    expect(handle.sample).toBe("real-handle");
  });
});

describe("mapping-options PATCH", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "owner-1" } as never);
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue(row());
    vi.mocked(updateAcsFieldMapping).mockResolvedValue(true);
  });

  // ACS caps `Product.attributes` at 200 entries, and this app reserves some of that for its own
  // bookkeeping fields — see `MAX_CUSTOM_ATTRIBUTES`'s own comment in the route.
  it("rejects more custom attributes than ACS (minus this app's own headroom) can hold", async () => {
    const customAttributes = Array.from({ length: 181 }, (_, i) => ({
      key: `attr_${i}`,
      name: `Attr ${i}`,
      type: "text",
      source: { kind: "meta", key: `meta.attr_${i}` },
    }));

    const res = await PATCH(patchRequest({ customAttributes }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/200 custom attributes/);
    expect(updateAcsFieldMapping).not.toHaveBeenCalled();
  });

  it("accepts a custom attribute list right at the cap", async () => {
    const customAttributes = Array.from({ length: 180 }, (_, i) => ({
      key: `attr_${i}`,
      name: `Attr ${i}`,
      type: "text",
      source: { kind: "meta", key: `meta.attr_${i}` },
    }));

    const res = await PATCH(patchRequest({ customAttributes }));

    expect(res.status).toBe(200);
    expect(updateAcsFieldMapping).toHaveBeenCalledTimes(1);
  });

});
