import { db } from "@/lib/supabase/server";
import type { HardRule } from "@/lib/retrieval/types";
import { parseFieldOverrides, type AcsFieldOverrides } from "@/lib/catalog/option-groups";
import { hashFieldOverrides } from "@/lib/catalog/acs/field-overrides";
import type {
  StorePlatform,
  StoreConnectionStatus,
  StoreCategory,
  CategoryParentMap,
  MerchantTreeNode,
  SkuParentOverrides,
} from "@/modules/store/types";
import {
  parseSizeType,
  parseSizeTypeOverrides,
  type SizeType,
  type SizeTypeOverrides,
} from "@/lib/sizing/size-types";

/**
 * Where the catalog is in its enrichment/embedding lifecycle. Retrieval falls back to the
 * live store API while anything other than `ready` is in effect, so a shopper never sees an
 * empty catalog mid-backfill.
 *
 * `pending` exists so connecting a store returns immediately. Walking a large catalog takes
 * minutes, which is far too long to hold a request open and too fragile to fire-and-forget in
 * a serverless function that may be torn down the moment it responds — so connect only marks
 * the intent, and the scheduled enqueue route does the walk.
 */
export type CatalogSyncStatus = "idle" | "pending" | "indexing" | "ready" | "error";

/** Whether `selected_category_ids` holds top-level ids the server expands, or the already-expanded
 *  leaf set the category picker writes directly. */
export type CategorySelectionGranularity = "top_level" | "leaf";

/** Raw DB row shape for the `store_connections` table (camelCase, app-facing). */
export interface StoreConnectionRow {
  id: string;
  platform: StorePlatform;
  storeName: string;
  storeUrl: string;
  apiKeyEncrypted: string | null;
  status: StoreConnectionStatus;
  selectedCategoryIds: string[];
  /** `leaf` means `selectedCategoryIds` is already the fully expanded set the picker wrote, so
   *  nothing downstream should re-expand it. `top_level` only survives on rows predating the
   *  leaf-selection migration. */
  categorySelectionGranularity: CategorySelectionGranularity;
  categories: StoreCategory[];
  /** Categories step 2: platform category id to one of the five parent sizing categories. An
   *  in-scope id missing from here is unmapped, which the Categories tab refuses to leave. */
  categoryParentMap: CategoryParentMap;
  /** The Department > Subcategory > Leaf hierarchy the merchant built by hand. Empty on
   *  WooCommerce, which publishes its own; populated on Shopify, which publishes none. */
  categoryTree: MerchantTreeNode[];
  /** Stage 2 corrections: product external id to a parent, beating whatever its category path
   *  would give it. The escape hatch for paths that hold more than one kind of garment. */
  skuParentOverrides: SkuParentOverrides;
  /** Doc Part 2: which sizing system this catalog's size labels are written in. Read through
   *  `sizeTypeFor`, never directly, so the per-brand exceptions below cannot be skipped. */
  storeSizeType: SizeType;
  /** Brand key to sizing system, for the brands whose labels differ from the store default. */
  storeSizeTypeOverrides: SizeTypeOverrides;
  productCount: number;
  syncedAt: string | null;
  hardRules: HardRule[];
  styleGuide: string | null;
  catalogSyncStatus: CatalogSyncStatus;
  catalogSyncProgress: number;
  catalogSyncTotal: number;
  /** Categories still waiting for their first walk. Empty on a first-time index, which means the
   *  whole selection; populated when a merchant adds to an already-indexed catalog, so the walk
   *  covers only the addition instead of re-paging the entire selection. */
  catalogPendingCategoryIds: string[];
  /** When the merchant approved the 5-sample mapping preview. Null blocks the first backfill
   *  import from ever running. */
  acsMappingApprovedAt: string | null;
  /** The mapper version the approval above was recorded against. A mismatch against the
   *  mapper's current version forces the preview to be re-shown before syncing resumes. */
  acsMapperVersionApproved: number | null;
  /** Merchant option-group reassignments applied on top of the mapper's built-in name match. */
  acsFieldOverrides: AcsFieldOverrides;
  /** Fingerprint of the overrides that were approved. Drifting from a live hash of
   *  `acsFieldOverrides` reopens the approval gate — see `hasApprovedCurrentMapping`. */
  acsFieldOverridesApprovedHash: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToConnection(row: Record<string, unknown>): StoreConnectionRow {
  return {
    id: row.id as string,
    platform: row.platform as StorePlatform,
    storeName: row.store_name as string,
    storeUrl: row.store_url as string,
    apiKeyEncrypted: (row.api_key_encrypted as string | null) ?? null,
    status: row.status as StoreConnectionStatus,
    selectedCategoryIds: (row.selected_category_ids as string[]) ?? [],
    categorySelectionGranularity:
      (row.category_selection_granularity as CategorySelectionGranularity | null) ?? "leaf",
    categories: (row.categories as StoreCategory[]) ?? [],
    categoryParentMap: (row.category_parent_map as CategoryParentMap | null) ?? {},
    categoryTree: (row.category_tree as MerchantTreeNode[] | null) ?? [],
    skuParentOverrides: (row.sku_parent_overrides as SkuParentOverrides | null) ?? {},
    storeSizeType: parseSizeType(row.store_size_type),
    storeSizeTypeOverrides: parseSizeTypeOverrides(row.store_size_type_overrides),
    productCount: (row.product_count as number) ?? 0,
    syncedAt: (row.synced_at as string | null) ?? null,
    hardRules: (row.hard_rules as HardRule[]) ?? [],
    styleGuide: (row.style_guide as string | null) ?? null,
    catalogSyncStatus: (row.catalog_sync_status as CatalogSyncStatus) ?? "idle",
    catalogSyncProgress: (row.catalog_sync_progress as number) ?? 0,
    catalogSyncTotal: (row.catalog_sync_total as number) ?? 0,
    catalogPendingCategoryIds: (row.catalog_pending_category_ids as string[] | null) ?? [],
    acsMappingApprovedAt: (row.acs_mapping_approved_at as string | null) ?? null,
    acsMapperVersionApproved: (row.acs_mapper_version_approved as number | null) ?? null,
    acsFieldOverrides: parseFieldOverrides(row.acs_field_overrides),
    acsFieldOverridesApprovedHash: (row.acs_field_overrides_approved_hash as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Looked up by the queue drain and webhook routes, which know a connection id but have no
 *  session to resolve an owner from. */
export async function getStoreConnectionById(id: string): Promise<StoreConnectionRow | null> {
  const { data, error } = await db.from("store_connections").select("*").eq("id", id).maybeSingle();

  if (error) {
    console.error("[db/store-connections getStoreConnectionById]", error);
    return null;
  }

  return data ? rowToConnection(data) : null;
}

/** Resolves the connection a webhook belongs to. Store webhooks identify their origin by
 *  domain (`X-Shopify-Shop-Domain`, `X-WC-Webhook-Source`) and nothing else, so this is the
 *  only handle available before the payload can be trusted. */
export async function getStoreConnectionByStoreUrl(storeUrl: string): Promise<StoreConnectionRow | null> {
  const normalized = storeUrl.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");

  const { data, error } = await db
    .from("store_connections")
    .select("*")
    .ilike("store_url", normalized)
    .maybeSingle();

  if (error) {
    console.error("[db/store-connections getStoreConnectionByStoreUrl]", error);
    return null;
  }

  return data ? rowToConnection(data) : null;
}

export async function getStoreConnectionByOwner(ownerId: string): Promise<StoreConnectionRow | null> {
  const { data, error } = await db
    .from("store_connections")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    console.error("[db/store-connections getStoreConnectionByOwner]", error);
    return null;
  }

  return data ? rowToConnection(data) : null;
}

export interface UpsertStoreConnectionInput {
  ownerId: string;
  platform: StorePlatform;
  storeName: string;
  storeUrl: string;
  apiKeyEncrypted: string | null;
  productCount?: number;
  categories?: StoreCategory[];
}

/** Connects (or replaces) the account's single store connection. */
export async function upsertStoreConnection(input: UpsertStoreConnectionInput): Promise<StoreConnectionRow | null> {
  const { data, error } = await db
    .from("store_connections")
    .upsert(
      {
        owner_id: input.ownerId,
        platform: input.platform,
        store_name: input.storeName,
        store_url: input.storeUrl,
        api_key_encrypted: input.apiKeyEncrypted,
        status: "connected",
        selected_category_ids: [],
        categories: input.categories ?? [],
        product_count: input.productCount ?? 0,
        synced_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" }
    )
    .select("*")
    .single();

  if (error || !data) {
    console.error("[db/store-connections upsertStoreConnection]", error);
    return null;
  }

  return rowToConnection(data);
}

export interface UpdateStoreConnectionInput {
  selectedCategoryIds?: string[];
  categorySelectionGranularity?: CategorySelectionGranularity;
  categories?: StoreCategory[];
  categoryParentMap?: CategoryParentMap;
  categoryTree?: MerchantTreeNode[];
  skuParentOverrides?: SkuParentOverrides;
  storeSizeType?: SizeType;
  storeSizeTypeOverrides?: SizeTypeOverrides;
  productCount?: number;
  syncedAt?: string | null;
  status?: StoreConnectionStatus;
  hardRules?: HardRule[];
  styleGuide?: string | null;
  catalogSyncStatus?: CatalogSyncStatus;
  catalogSyncProgress?: number;
  catalogSyncTotal?: number;
  catalogPendingCategoryIds?: string[];
}

export async function updateStoreConnection(
  ownerId: string,
  patch: UpdateStoreConnectionInput
): Promise<StoreConnectionRow | null> {
  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.selectedCategoryIds !== undefined) dbPatch.selected_category_ids = patch.selectedCategoryIds;
  if (patch.categorySelectionGranularity !== undefined)
    dbPatch.category_selection_granularity = patch.categorySelectionGranularity;
  if (patch.categories !== undefined) dbPatch.categories = patch.categories;
  if (patch.categoryParentMap !== undefined) dbPatch.category_parent_map = patch.categoryParentMap;
  if (patch.categoryTree !== undefined) dbPatch.category_tree = patch.categoryTree;
  if (patch.skuParentOverrides !== undefined) dbPatch.sku_parent_overrides = patch.skuParentOverrides;
  if (patch.storeSizeType !== undefined) dbPatch.store_size_type = patch.storeSizeType;
  if (patch.storeSizeTypeOverrides !== undefined)
    dbPatch.store_size_type_overrides = patch.storeSizeTypeOverrides;
  if (patch.productCount !== undefined) dbPatch.product_count = patch.productCount;
  if (patch.syncedAt !== undefined) dbPatch.synced_at = patch.syncedAt;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.hardRules !== undefined) dbPatch.hard_rules = patch.hardRules;
  if (patch.styleGuide !== undefined) dbPatch.style_guide = patch.styleGuide;
  if (patch.catalogSyncStatus !== undefined) dbPatch.catalog_sync_status = patch.catalogSyncStatus;
  if (patch.catalogSyncProgress !== undefined) dbPatch.catalog_sync_progress = patch.catalogSyncProgress;
  if (patch.catalogSyncTotal !== undefined) dbPatch.catalog_sync_total = patch.catalogSyncTotal;
  if (patch.catalogPendingCategoryIds !== undefined)
    dbPatch.catalog_pending_category_ids = patch.catalogPendingCategoryIds;

  const { data, error } = await db
    .from("store_connections")
    .update(dbPatch)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error || !data) {
    console.error("[db/store-connections updateStoreConnection]", error);
    return null;
  }

  return rowToConnection(data);
}

/** Persists a merchant's option-group reassignments. Deliberately does not touch the approval
 *  columns: the saved overrides now hash differently from the approved hash, which is exactly what
 *  reopens the approval gate. */
export async function updateAcsFieldOverrides(
  connectionId: string,
  overrides: AcsFieldOverrides
): Promise<boolean> {
  const { error } = await db
    .from("store_connections")
    .update({ acs_field_overrides: overrides, updated_at: new Date().toISOString() })
    .eq("id", connectionId);

  if (error) {
    console.error("[db/store-connections updateAcsFieldOverrides]", error);
    return false;
  }

  return true;
}

/** Records the merchant's approval of the mapping shown in Setup Stage 1, gating indexing.
 *  `mapperVersion` and a hash of the current overrides are stamped alongside, so either a mapper
 *  change on deploy or the merchant editing a role later stops matching and forces a re-approval.
 *
 *  The overrides are re-read here rather than passed in by the caller so the hash can never be
 *  stamped against a stale copy: approving what the merchant saw two saves ago would leave the gate
 *  open on a mapping nobody reviewed. */
export async function recordAcsMappingApproval(connectionId: string, mapperVersion: number): Promise<boolean> {
  const current = await getStoreConnectionById(connectionId);
  if (!current) return false;

  const { error } = await db
    .from("store_connections")
    .update({
      acs_mapping_approved_at: new Date().toISOString(),
      acs_mapper_version_approved: mapperVersion,
      acs_field_overrides_approved_hash: hashFieldOverrides(current.acsFieldOverrides),
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);

  if (error) {
    console.error("[db/store-connections recordAcsMappingApproval]", error);
    return false;
  }

  return true;
}

/** Sync-state writes come from background jobs that know the connection id but have no owner
 *  in scope, so they can't go through the owner-keyed update above. */
export async function updateCatalogSyncState(
  connectionId: string,
  patch: {
    status?: CatalogSyncStatus;
    progress?: number;
    total?: number;
    pendingCategoryIds?: string[];
  }
): Promise<boolean> {
  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) dbPatch.catalog_sync_status = patch.status;
  if (patch.progress !== undefined) dbPatch.catalog_sync_progress = patch.progress;
  if (patch.total !== undefined) dbPatch.catalog_sync_total = patch.total;
  if (patch.pendingCategoryIds !== undefined) dbPatch.catalog_pending_category_ids = patch.pendingCategoryIds;

  const { error } = await db.from("store_connections").update(dbPatch).eq("id", connectionId);

  if (error) {
    console.error("[db/store-connections updateCatalogSyncState]", error);
    return false;
  }

  return true;
}

/** Every connected store, for the scheduled reconciliation pass — which runs per connection
 *  and has no user session to scope itself to. */
export async function listConnectedStores(): Promise<StoreConnectionRow[]> {
  const { data, error } = await db.from("store_connections").select("*").eq("status", "connected");

  if (error) {
    console.error("[db/store-connections listConnectedStores]", error);
    return [];
  }

  return (data ?? []).map(rowToConnection);
}

/** Stores whose catalog walk hasn't started yet — picked up by the scheduled enqueue route. */
export async function listConnectionsBySyncStatus(status: CatalogSyncStatus): Promise<StoreConnectionRow[]> {
  const { data, error } = await db.from("store_connections").select("*").eq("catalog_sync_status", status);

  if (error) {
    console.error("[db/store-connections listConnectionsBySyncStatus]", error);
    return [];
  }

  return (data ?? []).map(rowToConnection);
}

export async function deleteStoreConnection(ownerId: string): Promise<boolean> {
  const { error } = await db.from("store_connections").delete().eq("owner_id", ownerId);

  if (error) {
    console.error("[db/store-connections deleteStoreConnection]", error);
    return false;
  }

  return true;
}
