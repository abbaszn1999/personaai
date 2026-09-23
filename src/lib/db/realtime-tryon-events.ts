import type { UsageSurface } from "@/lib/billing/pricing";
import { graceFloor } from "@/lib/billing/wallets";
import { maybeAlertWalletUsage } from "@/lib/billing/usage-alerts";
import { db } from "@/lib/supabase/server";

export interface RecordRealtimeTryOnEventInput {
  ownerId: string;
  sessionId: string;
  productId: string;
  productName: string;
  durationSeconds: number;
  cycleStartIso: string;
  includedAllowanceSeconds: number;
  idempotencyKey: string;
  /** False for a garment preview. Only the session row moves the allowance and balance. */
  billable: boolean;
  source?: UsageSurface | null;
}

/** Atomically logs a completed preview and charges only its marginal overage seconds. */
export async function consumeLiveTryOnSeconds(input: RecordRealtimeTryOnEventInput): Promise<number | null> {
  const { data, error } = await db.rpc("consume_live_tryon_seconds", {
    p_user_id: input.ownerId,
    p_session_id: input.sessionId,
    p_product_id: input.productId,
    p_product_name: input.productName,
    p_duration_seconds: input.durationSeconds,
    p_cycle_start: input.cycleStartIso,
    p_included_allowance: input.includedAllowanceSeconds,
    p_idempotency_key: input.idempotencyKey,
    p_billable: input.billable,
    p_balance_floor: graceFloor(input.includedAllowanceSeconds),
    p_source: input.source ?? null,
  });

  if (error) {
    console.error("[db/realtime-tryon-events consumeLiveTryOnSeconds]", error);
    throw error;
  }
  if (input.billable && typeof data === "number") {
    const used = await getLiveTryOnSecondsUsedForOwner(input.ownerId, input.cycleStartIso);
    await maybeAlertWalletUsage({
      userId: input.ownerId,
      wallet: "live",
      used,
      allowance: input.includedAllowanceSeconds,
      cycleStartIso: input.cycleStartIso,
    });
  }
  return typeof data === "number" ? data : null;
}

export interface RealtimeTryOnEventRow {
  sessionId: string;
  productId: string;
  productName: string;
  durationSeconds: number;
  billable: boolean;
  createdAt: string;
}

export async function getRealtimeTryOnEventsInRange(
  workspaceId: string,
  sinceIso: string,
  untilIso: string
): Promise<RealtimeTryOnEventRow[]> {
  const { data, error } = await db
    .from("realtime_tryon_events")
    .select("session_id, product_id, product_name, duration_seconds, billable, created_at")
    // `workspace_id` was dropped from this table — "workspace" and "owner" are the same
    // thing now, so this stays keyed on owner_id under the hood.
    .eq("owner_id", workspaceId)
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
    billable: row.billable !== false,
    createdAt: row.created_at as string,
  }));
}

export async function getRealtimeTryOnEventsForOwnerInRange(
  ownerId: string,
  sinceIso: string,
  untilIso?: string
): Promise<RealtimeTryOnEventRow[]> {
  let query = db
    .from("realtime_tryon_events")
    .select("session_id, product_id, product_name, duration_seconds, billable, created_at")
    .eq("owner_id", ownerId)
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
    billable: row.billable !== false,
    createdAt: row.created_at as string,
  }));
}

export async function getLiveTryOnSecondsUsedForOwner(ownerId: string, sinceIso: string): Promise<number> {
  const events = await getRealtimeTryOnEventsForOwnerInRange(ownerId, sinceIso);
  return events.reduce((sum, event) => sum + (event.billable ? event.durationSeconds : 0), 0);
}
