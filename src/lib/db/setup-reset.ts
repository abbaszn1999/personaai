import { db } from "@/lib/supabase/server";
import { EMPTY_ACS_MAPPING } from "@/lib/catalog/acs-mapping";
import { parseStoreBrandMapping } from "@/lib/sizing/brand-mapping";
import { DEFAULT_SIZE_SETTINGS } from "@/lib/sizing/size-types";
import { EMPTY_PERSONA_SCOPE, PERSONA_TAXONOMY_VERSION } from "@/modules/store/mapping/persona-taxonomy";
import type { SetupResetScope, SetupResetState } from "@/lib/catalog/setup-reset-state";

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

/** Drops the store's Stage 5 mirror of its ACS documents, which is rewritten by the next publish. */
export async function wipeAcsMirror(connectionId: string): Promise<void> {
  for (const table of ["acs_catalog_mirror", "acs_catalog_mirror_state"] as const) {
    const { error } = await db.from(table).delete().eq("connection_id", connectionId);
    if (error) console.error("[db/setup-reset wipeAcsMirror]", table, connectionId, error);
  }
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
  const update: Record<string, unknown> = {};
  if (patch.status !== undefined) update.setup_reset_status = patch.status;
  if (patch.scope !== undefined) update.setup_reset_scope = patch.scope;
  if (patch.startedAt !== undefined) update.setup_reset_started_at = patch.startedAt;
  if (patch.finishedAt !== undefined) update.setup_reset_finished_at = patch.finishedAt;
  if (patch.deleted !== undefined) update.setup_reset_deleted = patch.deleted;
  if (patch.error !== undefined) update.setup_reset_error = patch.error;

  const { error } = await db.from("store_connections").update(update).eq("id", connectionId);
  if (error) {
    console.error("[db/setup-reset writeSetupResetState]", connectionId, error);
    return false;
  }
  return true;
}
