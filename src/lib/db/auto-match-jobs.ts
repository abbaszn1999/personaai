import { db } from "@/lib/supabase/server";
import { assertConnectionId } from "@/lib/catalog/acs/isolation";
import {
  AUTO_MATCH_DEADLINE_GRACE_MS,
  AUTO_MATCH_DEADLINE_MS,
  AUTO_MATCH_STALE_MS,
  type AutoMatchPhase,
  type AutoMatchResult,
} from "@/lib/catalog/auto-match-state";
import { PERSONA_TAXONOMY_VERSION, type PersonaCategoryMap } from "@/modules/store/mapping/persona-taxonomy";

/** The columns of a store that has no AI match on record. */
export const IDLE_AUTO_MATCH_COLUMNS = {
  persona_auto_match_status: "idle",
  persona_auto_match_job_id: null,
  persona_auto_match_phase: null,
  persona_auto_match_started_at: null,
  persona_auto_match_heartbeat_at: null,
  persona_auto_match_finished_at: null,
  persona_auto_match_sampled: 0,
  persona_auto_match_total: 0,
  persona_auto_match_result: null,
  persona_auto_match_error: null,
} as const;

function ownedRun(connectionId: string, jobId: string, patch: Record<string, unknown>) {
  return db
    .from("store_connections")
    .update(patch)
    .eq("id", connectionId)
    .eq("persona_auto_match_job_id", jobId)
    .eq("persona_auto_match_status", "running")
    .select("id");
}

/**
 * Starts a run for this store unless one is already alive. One conditional update, so two clicks
 * racing each other cannot both start a run. A run that went silent or outlived its deadline is dead
 * and may be replaced.
 */
export async function claimAutoMatchJob(connectionId: string, jobId: string, total: number): Promise<boolean> {
  assertConnectionId(connectionId);
  const now = Date.now();
  const startedAt = new Date(now).toISOString();
  const silentSince = new Date(now - AUTO_MATCH_STALE_MS).toISOString();
  const expiredSince = new Date(now - AUTO_MATCH_DEADLINE_MS - AUTO_MATCH_DEADLINE_GRACE_MS).toISOString();

  const { data, error } = await db
    .from("store_connections")
    .update({
      ...IDLE_AUTO_MATCH_COLUMNS,
      persona_auto_match_status: "running",
      persona_auto_match_job_id: jobId,
      persona_auto_match_phase: "sampling",
      persona_auto_match_started_at: startedAt,
      persona_auto_match_heartbeat_at: startedAt,
      persona_auto_match_total: total,
    })
    .eq("id", connectionId)
    .or(
      [
        "persona_auto_match_status.neq.running",
        "persona_auto_match_heartbeat_at.is.null",
        `persona_auto_match_heartbeat_at.lt."${silentSince}"`,
        `persona_auto_match_started_at.lt."${expiredSince}"`,
      ].join(","),
    )
    .select("id");
  if (error) {
    console.error("[db/auto-match-jobs claimAutoMatchJob]", connectionId, error);
    return false;
  }
  return (data ?? []).length > 0;
}

/**
 * Reports progress and proves the run is alive. False only when the run is no longer the store's
 * current one (the mapping was cleared or a newer run replaced it), which tells it to stop. A failed
 * write proves nothing, so the run carries on.
 */
export async function touchAutoMatchJob(
  connectionId: string,
  jobId: string,
  patch: { phase?: AutoMatchPhase; sampled?: number } = {},
): Promise<boolean> {
  assertConnectionId(connectionId);
  const update: Record<string, unknown> = { persona_auto_match_heartbeat_at: new Date().toISOString() };
  if (patch.phase !== undefined) update.persona_auto_match_phase = patch.phase;
  if (patch.sampled !== undefined) update.persona_auto_match_sampled = patch.sampled;

  const { data, error } = await ownedRun(connectionId, jobId, update);
  if (error) {
    console.error("[db/auto-match-jobs touchAutoMatchJob]", connectionId, error);
    return true;
  }
  return (data ?? []).length > 0;
}

export async function failAutoMatchJob(connectionId: string, jobId: string, message: string): Promise<boolean> {
  assertConnectionId(connectionId);
  const finishedAt = new Date().toISOString();
  const { error } = await ownedRun(connectionId, jobId, {
    persona_auto_match_status: "failed",
    persona_auto_match_finished_at: finishedAt,
    persona_auto_match_heartbeat_at: finishedAt,
    persona_auto_match_error: message.slice(0, 500),
  });
  if (error) {
    console.error("[db/auto-match-jobs failAutoMatchJob]", connectionId, error);
    return false;
  }
  return true;
}

export interface AutoMatchCompletion {
  /** The store's whole mapping with the AI's verdicts added; null when the AI matched nothing. */
  personaCategoryMap: PersonaCategoryMap | null;
  /** True for a store that never published, whose catalog sync restarts with the new mapping. */
  resetCatalogSync: boolean;
  result: AutoMatchResult;
}

/**
 * Saves the AI's mapping and finishes the run in one write, so the mapping is never saved without
 * the run reading done, or the reverse. Writes nothing, and returns false, when the run is no longer
 * the store's current one.
 */
export async function completeAutoMatchJob(
  connectionId: string,
  jobId: string,
  completion: AutoMatchCompletion,
): Promise<boolean> {
  assertConnectionId(connectionId);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    persona_auto_match_status: "done",
    persona_auto_match_phase: null,
    persona_auto_match_finished_at: now,
    persona_auto_match_heartbeat_at: now,
    persona_auto_match_result: completion.result,
    persona_auto_match_error: null,
  };
  if (completion.personaCategoryMap) {
    Object.assign(patch, {
      persona_taxonomy_version: PERSONA_TAXONOMY_VERSION,
      persona_category_map: completion.personaCategoryMap,
      persona_mapping_updated_at: now,
      persona_auto_match_completed_at: now,
      updated_at: now,
    });
    if (completion.resetCatalogSync) {
      Object.assign(patch, {
        catalog_sync_status: "idle",
        catalog_sync_progress: 0,
        catalog_sync_total: 0,
        catalog_pending_category_ids: [],
      });
    }
  }

  const { data, error } = await ownedRun(connectionId, jobId, patch);
  if (error) {
    console.error("[db/auto-match-jobs completeAutoMatchJob]", connectionId, error);
    throw new Error("Could not save the AI matches.");
  }
  return (data ?? []).length > 0;
}

/** Forgets the store's last AI match. Any run still at work loses its claim and stops writing. */
export async function resetAutoMatchJob(connectionId: string): Promise<boolean> {
  assertConnectionId(connectionId);
  const { error } = await db.from("store_connections").update(IDLE_AUTO_MATCH_COLUMNS).eq("id", connectionId);
  if (error) {
    console.error("[db/auto-match-jobs resetAutoMatchJob]", connectionId, error);
    return false;
  }
  return true;
}
