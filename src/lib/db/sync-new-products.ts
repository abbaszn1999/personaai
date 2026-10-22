import { db } from "@/lib/supabase/server";

const TABLE = "sync_new_products";
const READ_PAGE = 1_000;
const WRITE_CHUNK = 500;
const ID_CHUNK = 200;

export const SYNC_PRODUCT_SOURCES = ["webhook", "reconcile", "manual"] as const;
export type SyncProductSource = (typeof SYNC_PRODUCT_SOURCES)[number];

export const SYNC_PRODUCT_STATUSES = ["pending", "syncing", "published", "removed"] as const;
export type SyncProductStatus = (typeof SYNC_PRODUCT_STATUSES)[number];

/** What a sync's Stage 5 resolved the product to when it was published. */
export type SyncChartStatus = "matched" | "unresolved" | "unsized" | "excluded" | "unavailable";

/** Everything copied from the store at detection; see the table comment. */
export interface SyncNewProductInput {
  externalId: string;
  sku: string | null;
  title: string;
  imageUrl: string | null;
  price: string | null;
  brandLabel: string | null;
  brandKey: string;
  sizingCategory: string;
  leafKey: string | null;
  rawSizeFormat: string | null;
}

export interface SyncNewProductRow extends SyncNewProductInput {
  connectionId: string;
  source: SyncProductSource;
  status: SyncProductStatus;
  syncRunId: string | null;
  brandWasNew: boolean | null;
  chartStatus: SyncChartStatus | null;
  detectedAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

function rowToProduct(row: Record<string, unknown>): SyncNewProductRow {
  return {
    connectionId: row.connection_id as string,
    externalId: row.external_id as string,
    sku: (row.sku as string | null) ?? null,
    title: row.title as string,
    imageUrl: (row.image_url as string | null) ?? null,
    price: (row.price as string | null) ?? null,
    brandLabel: (row.brand_label as string | null) ?? null,
    brandKey: (row.brand_key as string) ?? "",
    sizingCategory: (row.sizing_category as string) ?? "",
    leafKey: (row.leaf_key as string | null) ?? null,
    rawSizeFormat: (row.raw_size_format as string | null) ?? null,
    source: row.source as SyncProductSource,
    status: row.status as SyncProductStatus,
    syncRunId: (row.sync_run_id as string | null) ?? null,
    brandWasNew: (row.brand_was_new as boolean | null) ?? null,
    chartStatus: (row.chart_status as SyncChartStatus | null) ?? null,
    detectedAt: row.detected_at as string,
    updatedAt: row.updated_at as string,
    publishedAt: (row.published_at as string | null) ?? null,
  };
}

function inputColumns(input: SyncNewProductInput) {
  return {
    sku: input.sku,
    title: input.title,
    image_url: input.imageUrl,
    price: input.price,
    brand_label: input.brandLabel,
    brand_key: input.brandKey,
    sizing_category: input.sizingCategory,
    leaf_key: input.leafKey,
    raw_size_format: input.rawSizeFormat,
  };
}

async function statusesFor(
  connectionId: string,
  externalIds: readonly string[],
): Promise<Map<string, SyncProductStatus> | null> {
  const statuses = new Map<string, SyncProductStatus>();
  for (let i = 0; i < externalIds.length; i += ID_CHUNK) {
    const { data, error } = await db
      .from(TABLE)
      .select("external_id, status")
      .eq("connection_id", connectionId)
      .in("external_id", externalIds.slice(i, i + ID_CHUNK));
    if (error) {
      console.error("[db/sync-new-products statusesFor]", connectionId, error);
      return null;
    }
    for (const row of (data ?? []) as Array<{ external_id: string; status: SyncProductStatus }>) {
      statuses.set(row.external_id, row.status);
    }
  }
  return statuses;
}

/**
 * Records products the store sells that ACS has never held, as waiting for the next Sync.
 *
 * A product already queued keeps its place and its first source, but takes the store's latest title,
 * price and brand: a merchant who fixes a typo before syncing should sync the fixed product. One a
 * sync already took (`syncing`, `published`) is left alone, and one the store deleted and re-created
 * comes back as pending. Returns how many products were newly queued.
 */
export async function recordPendingSyncProducts(
  connectionId: string,
  inputs: readonly SyncNewProductInput[],
  source: SyncProductSource,
): Promise<number> {
  const unique = new Map<string, SyncNewProductInput>();
  for (const input of inputs) unique.set(input.externalId, input);
  if (unique.size === 0) return 0;

  const existing = await statusesFor(connectionId, [...unique.keys()]);
  if (!existing) return 0;

  const now = new Date().toISOString();
  const fresh: Record<string, unknown>[] = [];
  const refresh: Record<string, unknown>[] = [];
  for (const input of unique.values()) {
    const status = existing.get(input.externalId);
    if (status === "syncing" || status === "published") continue;
    const row = {
      connection_id: connectionId,
      external_id: input.externalId,
      ...inputColumns(input),
      status: "pending",
      updated_at: now,
    };
    if (status === undefined) fresh.push({ ...row, source, detected_at: now });
    else refresh.push(status === "removed" ? { ...row, source, detected_at: now, sync_run_id: null } : row);
  }

  for (let i = 0; i < fresh.length; i += WRITE_CHUNK) {
    const { error } = await db
      .from(TABLE)
      .upsert(fresh.slice(i, i + WRITE_CHUNK), { onConflict: "connection_id,external_id", ignoreDuplicates: true });
    if (error) {
      console.error("[db/sync-new-products record insert]", connectionId, error);
      return 0;
    }
  }
  for (let i = 0; i < refresh.length; i += WRITE_CHUNK) {
    const { error } = await db
      .from(TABLE)
      .upsert(refresh.slice(i, i + WRITE_CHUNK), { onConflict: "connection_id,external_id" });
    if (error) console.error("[db/sync-new-products record refresh]", connectionId, error);
  }
  return fresh.length;
}

/**
 * Ids a sync still owns (`pending` or `syncing`). The webhook and the hourly reconcile leave these
 * out of ACS, so a product reaches ACS through Sync or not at all. Null when unreadable; callers
 * then hold nothing back rather than risk dropping a product the store already had.
 */
export async function listHeldSyncProductIds(connectionId: string): Promise<Set<string> | null> {
  const held = new Set<string>();
  for (let offset = 0; ; offset += READ_PAGE) {
    const { data, error } = await db
      .from(TABLE)
      .select("external_id")
      .eq("connection_id", connectionId)
      .in("status", ["pending", "syncing"])
      .order("external_id", { ascending: true })
      .range(offset, offset + READ_PAGE - 1);
    if (error) {
      console.error("[db/sync-new-products listHeld]", connectionId, error);
      return null;
    }
    const rows = (data ?? []) as Array<{ external_id: string }>;
    for (const row of rows) held.add(row.external_id);
    if (rows.length < READ_PAGE) return held;
  }
}

/** Every external id this table has ever recorded for the store, whatever its status. */
export async function listTrackedSyncProductIds(connectionId: string): Promise<Set<string> | null> {
  const ids = new Set<string>();
  for (let offset = 0; ; offset += READ_PAGE) {
    const { data, error } = await db
      .from(TABLE)
      .select("external_id")
      .eq("connection_id", connectionId)
      .neq("status", "removed")
      .order("external_id", { ascending: true })
      .range(offset, offset + READ_PAGE - 1);
    if (error) {
      console.error("[db/sync-new-products listTracked]", connectionId, error);
      return null;
    }
    const rows = (data ?? []) as Array<{ external_id: string }>;
    for (const row of rows) ids.add(row.external_id);
    if (rows.length < READ_PAGE) return ids;
  }
}

export async function getSyncProductStatus(
  connectionId: string,
  externalId: string,
): Promise<SyncProductStatus | null> {
  const { data, error } = await db
    .from(TABLE)
    .select("status")
    .eq("connection_id", connectionId)
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) {
    console.error("[db/sync-new-products getStatus]", connectionId, error);
    return null;
  }
  return ((data as { status?: SyncProductStatus } | null)?.status) ?? null;
}

export async function listSyncProducts(
  connectionId: string,
  options: { statuses?: readonly SyncProductStatus[]; runId?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: SyncNewProductRow[]; total: number }> {
  const limit = options.limit ?? READ_PAGE;
  const offset = options.offset ?? 0;
  let query = db
    .from(TABLE)
    .select("*", { count: "exact" })
    .eq("connection_id", connectionId);
  if (options.statuses) query = query.in("status", [...options.statuses]);
  if (options.runId) query = query.eq("sync_run_id", options.runId);
  const { data, error, count } = await query
    .order("detected_at", { ascending: false })
    .order("external_id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) {
    console.error("[db/sync-new-products list]", connectionId, error);
    return { rows: [], total: 0 };
  }
  return { rows: ((data ?? []) as Array<Record<string, unknown>>).map(rowToProduct), total: count ?? 0 };
}

/** Every product a run took, read whole: a run's set is bounded by what was pending when it began. */
export async function listRunSyncProducts(runId: string): Promise<SyncNewProductRow[]> {
  const rows: SyncNewProductRow[] = [];
  for (let offset = 0; ; offset += READ_PAGE) {
    const { data, error } = await db
      .from(TABLE)
      .select("*")
      .eq("sync_run_id", runId)
      .order("external_id", { ascending: true })
      .range(offset, offset + READ_PAGE - 1);
    if (error) {
      console.error("[db/sync-new-products listRun]", runId, error);
      return rows;
    }
    const page = ((data ?? []) as Array<Record<string, unknown>>).map(rowToProduct);
    rows.push(...page);
    if (page.length < READ_PAGE) return rows;
  }
}

/** Hands every pending product to a run. Products detected after this belong to the next sync. */
export async function claimPendingSyncProducts(connectionId: string, runId: string): Promise<number> {
  const { data, error } = await db
    .from(TABLE)
    .update({ status: "syncing", sync_run_id: runId, brand_was_new: null, chart_status: null, updated_at: new Date().toISOString() })
    .eq("connection_id", connectionId)
    .eq("status", "pending")
    .select("external_id");
  if (error) {
    console.error("[db/sync-new-products claim]", connectionId, error);
    return 0;
  }
  return (data ?? []).length;
}

/** Gives a run's unpublished products back to the queue, when the run fails or is cancelled. */
export async function releaseRunSyncProducts(runId: string): Promise<void> {
  const { error } = await db
    .from(TABLE)
    .update({ status: "pending", sync_run_id: null, brand_was_new: null, chart_status: null, updated_at: new Date().toISOString() })
    .eq("sync_run_id", runId)
    .eq("status", "syncing");
  if (error) console.error("[db/sync-new-products release]", runId, error);
}

/** Sets one column to one value on many of a run's products, grouped so each value is one update. */
async function setRunColumn(
  runId: string,
  column: "brand_was_new" | "chart_status",
  values: ReadonlyMap<string, boolean | SyncChartStatus | null>,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const byValue = new Map<boolean | SyncChartStatus | null, string[]>();
  for (const [externalId, value] of values) byValue.set(value, [...(byValue.get(value) ?? []), externalId]);
  const updatedAt = new Date().toISOString();
  for (const [value, ids] of byValue) {
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const { error } = await db
        .from(TABLE)
        .update({ [column]: value, ...extra, updated_at: updatedAt })
        .eq("sync_run_id", runId)
        .in("external_id", ids.slice(i, i + ID_CHUNK));
      if (error) console.error(`[db/sync-new-products set ${column}]`, runId, error);
    }
  }
}

export function setRunBrandWasNew(runId: string, values: ReadonlyMap<string, boolean>): Promise<void> {
  return setRunColumn(runId, "brand_was_new", values);
}

/** Marks a run's products as written, with the sizing each was published with. */
export function markRunSyncProductsPublished(
  runId: string,
  chartStatuses: ReadonlyMap<string, SyncChartStatus>,
): Promise<void> {
  return setRunColumn(runId, "chart_status", chartStatuses, {
    status: "published",
    published_at: new Date().toISOString(),
  });
}

/**
 * A full Setup publish writes the whole selected catalog, held products included, so nothing is
 * left waiting for a sync afterwards.
 */
export async function markAllPendingSyncProductsPublished(connectionId: string, runId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db
    .from(TABLE)
    .update({ status: "published", sync_run_id: runId, published_at: now, updated_at: now })
    .eq("connection_id", connectionId)
    .in("status", ["pending", "syncing"]);
  if (error) console.error("[db/sync-new-products publishAll]", connectionId, error);
}

/** A run's product the store no longer sells (or that lost its image) by the time the run read it. */
export async function markRunSyncProductsRemoved(runId: string, externalIds: readonly string[]): Promise<void> {
  const now = new Date().toISOString();
  for (let i = 0; i < externalIds.length; i += ID_CHUNK) {
    const { error } = await db
      .from(TABLE)
      .update({ status: "removed", updated_at: now })
      .eq("sync_run_id", runId)
      .eq("status", "syncing")
      .in("external_id", externalIds.slice(i, i + ID_CHUNK));
    if (error) console.error("[db/sync-new-products removeFromRun]", runId, error);
  }
}

/** The store deleted the product, or it left the selected categories, before anyone synced it. */
export async function markSyncProductsRemoved(connectionId: string, externalIds: readonly string[]): Promise<void> {
  const now = new Date().toISOString();
  for (let i = 0; i < externalIds.length; i += ID_CHUNK) {
    const { error } = await db
      .from(TABLE)
      .update({ status: "removed", updated_at: now })
      .eq("connection_id", connectionId)
      .eq("status", "pending")
      .in("external_id", externalIds.slice(i, i + ID_CHUNK));
    if (error) console.error("[db/sync-new-products remove]", connectionId, error);
  }
}

/** Every product the given runs took, for Sync History's per-run counts. */
export async function listSyncProductsForRuns(runIds: readonly string[]): Promise<SyncNewProductRow[]> {
  if (runIds.length === 0) return [];
  const rows: SyncNewProductRow[] = [];
  for (let offset = 0; ; offset += READ_PAGE) {
    const { data, error } = await db
      .from(TABLE)
      .select("*")
      .in("sync_run_id", [...runIds])
      .order("external_id", { ascending: true })
      .range(offset, offset + READ_PAGE - 1);
    if (error) {
      console.error("[db/sync-new-products listForRuns]", error);
      return rows;
    }
    const page = ((data ?? []) as Array<Record<string, unknown>>).map(rowToProduct);
    rows.push(...page);
    if (page.length < READ_PAGE) return rows;
  }
}
