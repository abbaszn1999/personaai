import { db } from "@/lib/supabase/server";

export interface RecordRealtimeTryOnEventInput {
  ownerId: string;
  workspaceId: string;
  sessionId: string;
  productId: string;
  productName: string;
  durationSeconds: number;
  cycleStartIso: string;
  includedAllowanceSeconds: number;
  idempotencyKey: string;
}

/** Atomically logs a completed preview and charges only its marginal overage seconds. */
export async function consumeLiveTryOnSeconds(input: RecordRealtimeTryOnEventInput): Promise<number | null> {
  const { data, error } = await db.rpc("consume_live_tryon_seconds", {
    p_user_id: input.ownerId,
    p_workspace_id: input.workspaceId,
    p_session_id: input.sessionId,
    p_product_id: input.productId,
    p_product_name: input.productName,
    p_duration_seconds: input.durationSeconds,
    p_cycle_start: input.cycleStartIso,
    p_included_allowance: input.includedAllowanceSeconds,
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) {
    console.error("[db/realtime-tryon-events consumeLiveTryOnSeconds]", error);
    throw error;
  }
  return typeof data === "number" ? data : null;
}

export interface RealtimeTryOnEventRow {
  sessionId: string;
  productId: string;
  productName: string;
  durationSeconds: number;
  createdAt: string;
}

export async function getRealtimeTryOnEventsInRange(
  workspaceId: string,
  sinceIso: string,
  untilIso: string
): Promise<RealtimeTryOnEventRow[]> {
  const { data, error } = await db
    .from("realtime_tryon_events")
    .select("session_id, product_id, product_name, duration_seconds, created_at")
    .eq("workspace_id", workspaceId)
    .gte("created_at", sinceIso)
    .lt("created_at", untilIso);

  if (error) {
    console.error("[db/realtime-tryon-events getRealtimeTryOnEventsInRange]", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    sessionId: row.session_id as string,
    productId: row.product_id as string,
    productName: row.product_name as string,
    durationSeconds: row.duration_seconds as number,
    createdAt: row.created_at as string,
  }));
}

async function getOwnerWorkspaceIds(ownerId: string): Promise<string[]> {
  const { data, error } = await db.from("workspaces").select("id").eq("owner_id", ownerId);
  if (error) {
    console.error("[db/realtime-tryon-events getOwnerWorkspaceIds]", error);
    return [];
  }
  return (data ?? []).map((row) => row.id as string);
}

export async function getRealtimeTryOnEventsForOwnerInRange(
  ownerId: string,
  sinceIso: string,
  untilIso?: string
): Promise<RealtimeTryOnEventRow[]> {
  const workspaceIds = await getOwnerWorkspaceIds(ownerId);
  if (workspaceIds.length === 0) return [];

  let query = db
    .from("realtime_tryon_events")
    .select("session_id, product_id, product_name, duration_seconds, created_at")
    .in("workspace_id", workspaceIds)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });
  if (untilIso) query = query.lt("created_at", untilIso);

  const { data, error } = await query;
  if (error) {
    console.error("[db/realtime-tryon-events getRealtimeTryOnEventsForOwnerInRange]", error);
    return [];
  }
  return (data ?? []).map((row) => ({
    sessionId: row.session_id as string,
    productId: row.product_id as string,
    productName: row.product_name as string,
    durationSeconds: row.duration_seconds as number,
    createdAt: row.created_at as string,
  }));
}

export async function getLiveTryOnSecondsUsedForOwner(ownerId: string, sinceIso: string): Promise<number> {
  const events = await getRealtimeTryOnEventsForOwnerInRange(ownerId, sinceIso);
  return events.reduce((sum, event) => sum + event.durationSeconds, 0);
}
