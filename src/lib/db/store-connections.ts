import { db } from "@/lib/supabase/server";
import type { HardRule } from "@/lib/retrieval/types";
import { parseAcsMapping, type AcsFieldMapping } from "@/lib/catalog/acs-mapping";
import { hashFieldOverrides } from "@/lib/catalog/acs/field-overrides";
import type {
  StorePlatform,
  StoreConnectionStatus,
  StoreCategory,
  SkuParentOverrides,
} from "@/modules/store/types";
import {
  PERSONA_TAXONOMY_VERSION,
  type PersonaCategoryMap,
  type SerializedTaxonomyScope,
} from "@/modules/store/mapping/persona-taxonomy";
import { mappedSourceCategoryIds, parsePersonaCategoryMap, parsePersonaScope } from "@/lib/catalog/persona-mapping";
import { parseSizeSettings, type SizeSettings } from "@/lib/sizing/size-types";
import { parseSizingSource, type SizingSource } from "@/lib/sizing/sizing-source";

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

/** Where a full-catalog CMS column coverage walk is — see `discover-cms-columns.ts`. Distinct
 *  from `CatalogSyncStatus`: this walk only ever counts and samples columns, never indexes
 *  anything, so a store can run (or fail, or finish) one independently of ACS sync state. */
export type CmsColumnDiscoveryStatus = "idle" | "running" | "done" | "error";

/** Raw DB row shape for the `store_connections` table (camelCase, app-facing). */
export interface StoreConnectionRow {
  id: string;
  platform: StorePlatform;
  storeName: string;
  storeUrl: string;
  apiKeyEncrypted: string | null;
  status: StoreConnectionStatus;
  selectedCategoryIds: string[];
  categories: StoreCategory[];
  /** Stage 2 corrections: product external id to a parent, beating whatever its category path
   *  would give it. The escape hatch for paths that hold more than one kind of garment. */
  skuParentOverrides: SkuParentOverrides;
  personaTaxonomyVersion: number;
  personaTaxonomyScope: SerializedTaxonomyScope;
  personaCategoryMap: PersonaCategoryMap;
  personaMappingUpdatedAt: string | null;
  /** When AI Auto-Match last successfully classified and saved this store's categories. Null
   *  means it has never run (or the mapping was cleared since); non-null blocks further runs
   *  until a clear — see the Mapping page's Auto-Match one-shot rule. */
  personaAutoMatchCompletedAt: string | null;
  /** Doc Part 2: which sizing system this catalog's size labels are written in, plus the brands
   *  whose labels differ from it. Read through `sizeTypeFor`, never directly, so the per-brand
   *  exceptions cannot be skipped. */
  storeSizeSettings: SizeSettings;
  /** Where the charts a shopper is sized against come from — the pipeline's own output, or per-product
   *  charts the merchant already keeps and bound in Stage 1. */
  sizingSource: SizingSource;
  /** When the merchant skipped setup stages 2-5 because their own charts made them redundant; null if
   *  they never did. Cleared when the size chart binding goes away, since the work is needed again. */
  sizingStagesSkippedAt: string | null;
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
  /** Which of the merchant's columns feeds each ACS field, plus their declared custom attributes —
   *  Setup Stage 1's saved answer. Empty means auto-mapping and the built-in name match. */
  acsFieldMapping: AcsFieldMapping;
  /** Fingerprint of the mapping that was approved. Drifting from a live hash of `acsFieldMapping`
   *  reopens the approval gate — see `hasApprovedCurrentMapping`. */
  acsFieldOverridesApprovedHash: string | null;
  /** Full-catalog CMS column coverage walk state — see `discover-cms-columns.ts`. `idle` means
   *  Stage 1's column list is still whatever the 25-product sample plus platform-declared schema
   *  found; `done` means `store_cms_columns` holds real coverage from every product. */
  cmsColumnDiscoveryStatus: CmsColumnDiscoveryStatus;
  /** Which of the pager's `groups` (Shopify collection, Woo category chunk) the walk is on. */
  cmsColumnDiscoveryGroupIndex: number;
  /** The pager's own opaque cursor within the current group — a Shopify page cursor or a
   *  WooCommerce page number, exactly as `CatalogPager.fetchPage` returns it. */
  cmsColumnDiscoveryCursor: string | null;
  cmsColumnDiscoveryScanned: number;
  cmsColumnDiscoveryError: string | null;
  cmsColumnDiscoveryUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToConnection(row: Record<string, unknown>): StoreConnectionRow {
  const categories = (row.categories as StoreCategory[]) ?? [];
  const personaTaxonomyScope = parsePersonaScope(row.persona_taxonomy_scope);
  const personaCategoryMap = parsePersonaCategoryMap(row.persona_category_map, categories);
  return {
    id: row.id as string,
    platform: row.platform as StorePlatform,
    storeName: row.store_name as string,
    storeUrl: row.store_url as string,
    apiKeyEncrypted: (row.api_key_encrypted as string | null) ?? null,
    status: row.status as StoreConnectionStatus,
    selectedCategoryIds: mappedSourceCategoryIds(personaCategoryMap),
    categories,
    skuParentOverrides: (row.sku_parent_overrides as SkuParentOverrides | null) ?? {},
    personaTaxonomyVersion: (row.persona_taxonomy_version as number | null) ?? PERSONA_TAXONOMY_VERSION,
    personaTaxonomyScope,
    personaCategoryMap,
    personaMappingUpdatedAt: (row.persona_mapping_updated_at as string | null) ?? null,
    personaAutoMatchCompletedAt: (row.persona_auto_match_completed_at as string | null) ?? null,
    storeSizeSettings: parseSizeSettings(row.store_size_settings),
    sizingSource: parseSizingSource(row.sizing_source),
    sizingStagesSkippedAt: (row.sizing_stages_skipped_at as string | null) ?? null,
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
    acsFieldMapping: parseAcsMapping(row.acs_field_overrides),
    acsFieldOverridesApprovedHash: (row.acs_field_overrides_approved_hash as string | null) ?? null,
    cmsColumnDiscoveryStatus: (row.cms_column_discovery_status as CmsColumnDiscoveryStatus) ?? "idle",
    cmsColumnDiscoveryGroupIndex: (row.cms_column_discovery_group_index as number) ?? 0,
    cmsColumnDiscoveryCursor: (row.cms_column_discovery_cursor as string | null) ?? null,
    cmsColumnDiscoveryScanned: (row.cms_column_discovery_scanned as number) ?? 0,
    cmsColumnDiscoveryError: (row.cms_column_discovery_error as string | null) ?? null,
    cmsColumnDiscoveryUpdatedAt: (row.cms_column_discovery_updated_at as string | null) ?? null,
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
        categories: input.categories ?? [],
        persona_taxonomy_version: PERSONA_TAXONOMY_VERSION,
        persona_taxonomy_scope: {
          configured: false,
          enabledDeptIds: [],
          enabledLeafKeys: [],
          customLeaves: [],
          customCategories: [],
        },
        persona_category_map: {},
        persona_mapping_updated_at: null,
        persona_auto_match_completed_at: null,
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
  categories?: StoreCategory[];
  skuParentOverrides?: SkuParentOverrides;
  personaTaxonomyVersion?: number;
  personaTaxonomyScope?: SerializedTaxonomyScope;
  personaCategoryMap?: PersonaCategoryMap;
  personaMappingUpdatedAt?: string | null;
  personaAutoMatchCompletedAt?: string | null;
  storeSizeSettings?: SizeSettings;
  sizingSource?: SizingSource;
  sizingStagesSkippedAt?: string | null;
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
  if (patch.categories !== undefined) dbPatch.categories = patch.categories;
  if (patch.skuParentOverrides !== undefined) dbPatch.sku_parent_overrides = patch.skuParentOverrides;
  if (patch.personaTaxonomyVersion !== undefined) dbPatch.persona_taxonomy_version = patch.personaTaxonomyVersion;
  if (patch.personaTaxonomyScope !== undefined) dbPatch.persona_taxonomy_scope = patch.personaTaxonomyScope;
  if (patch.personaCategoryMap !== undefined) dbPatch.persona_category_map = patch.personaCategoryMap;
  if (patch.personaMappingUpdatedAt !== undefined) dbPatch.persona_mapping_updated_at = patch.personaMappingUpdatedAt;
  if (patch.personaAutoMatchCompletedAt !== undefined)
    dbPatch.persona_auto_match_completed_at = patch.personaAutoMatchCompletedAt;
  if (patch.storeSizeSettings !== undefined) dbPatch.store_size_settings = patch.storeSizeSettings;
  if (patch.sizingSource !== undefined) dbPatch.sizing_source = patch.sizingSource;
  if (patch.sizingStagesSkippedAt !== undefined) dbPatch.sizing_stages_skipped_at = patch.sizingStagesSkippedAt;
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

/** Persists a merchant's Stage 1 mapping. Deliberately does not touch the approval columns: the
 *  saved mapping now hashes differently from the approved hash, which is exactly what reopens the
 *  approval gate. */
export async function updateAcsFieldMapping(connectionId: string, mapping: AcsFieldMapping): Promise<boolean> {
  const { error } = await db
    .from("store_connections")
    .update({ acs_field_overrides: mapping, updated_at: new Date().toISOString() })
    .eq("id", connectionId);

  if (error) {
    console.error("[db/store-connections updateAcsFieldMapping]", error);
    return false;
  }

  return true;
}

/** Records the merchant's approval of the mapping shown in Setup Stage 1, gating indexing.
 *  `mapperVersion` and a hash of the current mapping are stamped alongside, so either a mapper
 *  change on deploy or the merchant rebinding a column later stops matching and forces a
 *  re-approval.
 *
 *  The mapping is re-read here rather than passed in by the caller so the hash can never be stamped
 *  against a stale copy: approving what the merchant saw two saves ago would leave the gate open on a
 *  mapping nobody reviewed. */
export async function recordAcsMappingApproval(connectionId: string, mapperVersion: number): Promise<boolean> {
  const current = await getStoreConnectionById(connectionId);
  if (!current) return false;

  const { error } = await db
    .from("store_connections")
    .update({
      acs_mapping_approved_at: new Date().toISOString(),
      acs_mapper_version_approved: mapperVersion,
      acs_field_overrides_approved_hash: hashFieldOverrides(current.acsFieldMapping),
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

/** Full-catalog CMS column discovery writes come from the background walk (`discover-cms-columns.ts`),
 *  which — like the catalog sync walk — knows a connection id but has no owner in scope. */
export async function updateCmsColumnDiscoveryState(
  connectionId: string,
  patch: {
    status?: CmsColumnDiscoveryStatus;
    groupIndex?: number;
    cursor?: string | null;
    scanned?: number;
    error?: string | null;
  }
): Promise<boolean> {
  const dbPatch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    cms_column_discovery_updated_at: new Date().toISOString(),
  };
  if (patch.status !== undefined) dbPatch.cms_column_discovery_status = patch.status;
  if (patch.groupIndex !== undefined) dbPatch.cms_column_discovery_group_index = patch.groupIndex;
  if (patch.cursor !== undefined) dbPatch.cms_column_discovery_cursor = patch.cursor;
  if (patch.scanned !== undefined) dbPatch.cms_column_discovery_scanned = patch.scanned;
  if (patch.error !== undefined) dbPatch.cms_column_discovery_error = patch.error;

  const { error } = await db.from("store_connections").update(dbPatch).eq("id", connectionId);

  if (error) {
    console.error("[db/store-connections updateCmsColumnDiscoveryState]", error);
    return false;
  }

  return true;
}

/** Stores with a full-catalog column walk waiting for the worker's next tick. */
export async function listConnectionsByCmsColumnDiscoveryStatus(
  status: CmsColumnDiscoveryStatus
): Promise<StoreConnectionRow[]> {
  const { data, error } = await db.from("store_connections").select("*").eq("cms_column_discovery_status", status);

  if (error) {
    console.error("[db/store-connections listConnectionsByCmsColumnDiscoveryStatus]", error);
    return [];
  }

  return (data ?? []).map(rowToConnection);
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
