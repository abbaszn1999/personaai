import { db } from "@/lib/supabase/server";
import { EMPTY_ACS_MAPPING } from "@/lib/catalog/acs-mapping";
import { assertConnectionId } from "@/lib/catalog/acs/isolation";
import { parseStoreBrandMapping } from "@/lib/sizing/brand-mapping";
import { DEFAULT_SIZE_SETTINGS } from "@/lib/sizing/size-types";
import { EMPTY_PERSONA_SCOPE, PERSONA_TAXONOMY_VERSION } from "@/modules/store/mapping/persona-taxonomy";
import type { SetupResetScope, SetupResetState } from "@/lib/catalog/setup-reset-state";
import { IDLE_AUTO_MATCH_COLUMNS } from "@/lib/db/auto-match-jobs";

/**
 * Everything Setup's five stages produce for one store, as rows keyed by its connection: the run and
 * scan, the brand and leaf coverage, the per-product snapshot, the merchant's own private charts and
 * the Stage 5 catalog mirror. Shared global charts carry no connection id and are never touched.
 */
export const SETUP_TABLES = [
  "sizing_runs",
  "sizing_coverage",
  "sizing_path_coverage",
  "sizing_product_records",
  "sizing_null_records",
  "sizing_charts_private",
  "sizing_charts",
  "acs_catalog_mirror",
  "acs_catalog_mirror_state",
] as const;

/** Deletes this store's rows from every Setup table. Returns the tables that could not be cleared. */
export async function wipeSetupTables(connectionId: string): Promise<string[]> {
  assertConnectionId(connectionId);
  const failed: string[] = [];
  for (const table of SETUP_TABLES) {
    const { error } = await db.from(table).delete().eq("connection_id", connectionId);
    if (error) {
      console.error("[db/setup-reset wipeSetupTables]", table, connectionId, error);
      failed.push(table);
    }
  }
  return failed;
}

/**
 * The proof `wipeSetupTables` worked: the Setup tables still holding rows for this store, after
 * counting each one. Null when a count could not be read, which proves nothing either way.
 */
export async function setupTablesWithRows(connectionId: string): Promise<string[] | null> {
  assertConnectionId(connectionId);
  const remaining: string[] = [];
  for (const table of SETUP_TABLES) {
    const { count, error } = await db
      .from(table)
      .select("connection_id", { count: "exact", head: true })
      .eq("connection_id", connectionId);
    if (error) {
      console.error("[db/setup-reset setupTablesWithRows]", table, connectionId, error);
      return null;
    }
    if ((count ?? 0) > 0) remaining.push(table);
  }
  return remaining;
}

/**
 * Puts the store's own Setup answers back to a new store's defaults: Column Mapping and its
 * approval, the size type, Stage 2 corrections, the brand mapping and the catalog sync state. The
 * mapping scope resets too when Mapping's "Start from scratch" was pressed.
 *
 * Clearing the approval is also what stops every writer: no backfill, scan or publish runs on an
 * unapproved Column Mapping.
 */
export async function resetSetupColumns(connectionId: string, scope: SetupResetScope): Promise<boolean> {
  assertConnectionId(connectionId);
  const patch: Record<string, unknown> = {
    acs_field_overrides: EMPTY_ACS_MAPPING,
    acs_mapping_approved_at: null,
    acs_mapper_version_approved: null,
    acs_field_overrides_approved_hash: null,
    store_size_settings: DEFAULT_SIZE_SETTINGS,
    sku_parent_overrides: {},
    sizing_brand_mapping: parseStoreBrandMapping(null),
    sizing_source: "ai_pipeline",
    sizing_stages_skipped_at: null,
    catalog_sync_status: "idle",
    catalog_sync_progress: 0,
    catalog_sync_total: 0,
    catalog_pending_category_ids: [],
    updated_at: new Date().toISOString(),
  };
  if (scope === "mapping") {
    Object.assign(patch, {
      persona_taxonomy_version: PERSONA_TAXONOMY_VERSION,
      persona_taxonomy_scope: EMPTY_PERSONA_SCOPE,
      persona_category_map: {},
      persona_mapping_updated_at: null,
      persona_auto_match_completed_at: null,
      ...IDLE_AUTO_MATCH_COLUMNS,
    });
  }

  const { error } = await db.from("store_connections").update(patch).eq("id", connectionId);
  if (error) {
    console.error("[db/setup-reset resetSetupColumns]", connectionId, error);
    return false;
  }
  return true;
}

export async function writeSetupResetState(
  connectionId: string,
  patch: Partial<SetupResetState>,
): Promise<boolean> {
  assertConnectionId(connectionId);
  const update: Record<string, unknown> = {};
  if (patch.status !== undefined) update.setup_reset_status = patch.status;
  if (patch.scope !== undefined) update.setup_reset_scope = patch.scope;
  if (patch.startedAt !== undefined) update.setup_reset_started_at = patch.startedAt;
  if (patch.finishedAt !== undefined) update.setup_reset_finished_at = patch.finishedAt;
  if (patch.deleted !== undefined) update.setup_reset_deleted = patch.deleted;
  if (patch.total !== undefined) update.setup_reset_total = patch.total;
  if (patch.leaseUntil !== undefined) update.setup_reset_lease_until = patch.leaseUntil;
  if (patch.error !== undefined) update.setup_reset_error = patch.error;

  const { error } = await db.from("store_connections").update(update).eq("id", connectionId);
  if (error) {
    console.error("[db/setup-reset writeSetupResetState]", connectionId, error);
    return false;
  }
  return true;
}

/**
 * Takes a running cleanup for one pass, unless another pass holds it. Each attempt is one
 * conditional update, so two passes racing for the same store cannot both win. Returns what the
 * earlier passes removed, which this one adds to.
 */
export async function claimSetupResetLease(
  connectionId: string,
  leaseMs: number,
): Promise<{ deleted: number } | null> {
  assertConnectionId(connectionId);
  const now = new Date();
  const patch = { setup_reset_lease_until: new Date(now.getTime() + leaseMs).toISOString() };
  const running = () =>
    db.from("store_connections").update(patch).eq("id", connectionId).eq("setup_reset_status", "running");

  for (const attempt of [
    () => running().is("setup_reset_lease_until", null).select("setup_reset_deleted"),
    () => running().lt("setup_reset_lease_until", now.toISOString()).select("setup_reset_deleted"),
  ]) {
    const { data, error } = await attempt();
    if (error) {
      console.error("[db/setup-reset claimSetupResetLease]", connectionId, error);
      return null;
    }
    const [row] = (data ?? []) as Array<{ setup_reset_deleted: number | null }>;
    if (row) return { deleted: row.setup_reset_deleted ?? 0 };
  }
  return null;
}

/** Stores whose cleanup is running with no pass at work on it, oldest reset first. */
export async function listUnclaimedSetupResets(limit: number): Promise<string[]> {
  const { data, error } = await db
    .from("store_connections")
    .select("id")
    .eq("setup_reset_status", "running")
    .or(`setup_reset_lease_until.is.null,setup_reset_lease_until.lt."${new Date().toISOString()}"`)
    .order("setup_reset_started_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[db/setup-reset listUnclaimedSetupResets]", error);
    return [];
  }
  return (data ?? []).map((row) => String(row.id));
}
