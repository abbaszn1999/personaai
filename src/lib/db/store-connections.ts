import { db } from "@/lib/supabase/server";
import type { StorePlatform, StoreConnectionStatus, StoreCategory } from "@/modules/store/types";

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
  productCount: number;
  syncedAt: string | null;
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
    categories: (row.categories as StoreCategory[]) ?? [],
    productCount: (row.product_count as number) ?? 0,
    syncedAt: (row.synced_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
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
  categories?: StoreCategory[];
  productCount?: number;
  syncedAt?: string | null;
  status?: StoreConnectionStatus;
}

export async function updateStoreConnection(
  ownerId: string,
  patch: UpdateStoreConnectionInput
): Promise<StoreConnectionRow | null> {
  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.selectedCategoryIds !== undefined) dbPatch.selected_category_ids = patch.selectedCategoryIds;
  if (patch.categories !== undefined) dbPatch.categories = patch.categories;
  if (patch.productCount !== undefined) dbPatch.product_count = patch.productCount;
  if (patch.syncedAt !== undefined) dbPatch.synced_at = patch.syncedAt;
  if (patch.status !== undefined) dbPatch.status = patch.status;

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

export async function deleteStoreConnection(ownerId: string): Promise<boolean> {
  const { error } = await db.from("store_connections").delete().eq("owner_id", ownerId);

  if (error) {
    console.error("[db/store-connections deleteStoreConnection]", error);
    return false;
  }

  return true;
}
