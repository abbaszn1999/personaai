import { SESSION_UNIT_NANOS } from "@/lib/billing/pricing";
import { graceFloor } from "@/lib/billing/wallets";
import { maybeAlertWalletUsage } from "@/lib/billing/usage-alerts";
import { db } from "@/lib/supabase/server";

export interface ConsumeSessionUnitsInput {
  ownerId: string;
  sessionId: string;
  costNanos: number;
  acsSearches: number;
  geminiCalls: number;
  cycleStartIso: string;
  includedAllowance: number;
  idempotencyKey: string;
}

/** Atomically folds one turn's cost into the carry, charges whole units past the allowance,
 *  and writes the event row. A repeated idempotency key returns the balance unchanged. */
export async function consumeSessionUnits(input: ConsumeSessionUnitsInput): Promise<number | null> {
  const { data, error } = await db.rpc("consume_session_units", {
    p_user_id: input.ownerId,
    p_session_id: input.sessionId,
    p_cost_nanos: input.costNanos,
    p_acs_searches: input.acsSearches,
    p_gemini_calls: input.geminiCalls,
    p_cycle_start: input.cycleStartIso,
    p_included_allowance: input.includedAllowance,
    p_idempotency_key: input.idempotencyKey,
    p_unit_nanos: SESSION_UNIT_NANOS,
    p_balance_floor: graceFloor(input.includedAllowance),
  });

  if (error) {
    console.error("[db/session-usage consumeSessionUnits]", error);
    throw error;
  }
  if (typeof data === "number") {
    const used = await getSessionUnitsUsedForOwner(input.ownerId, input.cycleStartIso);
    await maybeAlertWalletUsage({
      userId: input.ownerId,
      wallet: "sessions",
      used,
      allowance: input.includedAllowance,
      cycleStartIso: input.cycleStartIso,
    });
  }
  return typeof data === "number" ? data : null;
}

/** Whole session units completed since the start of the billing cycle. */
export async function getSessionUnitsUsedForOwner(ownerId: string, sinceIso: string): Promise<number> {
  const { data, error } = await db
    .from("session_usage_events")
    .select("units_charged")
    .eq("owner_id", ownerId)
    .gte("created_at", sinceIso);

  if (error) {
    console.error("[db/session-usage getSessionUnitsUsedForOwner]", error);
    return 0;
  }

  return (data ?? []).reduce((sum, row) => sum + (row.units_charged as number), 0);
}
