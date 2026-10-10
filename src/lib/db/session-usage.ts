import { SESSION_UNIT_NANOS, type UsageSurface } from "@/lib/billing/pricing";
import { maybeAlertWalletUsage } from "@/lib/billing/usage-alerts";
import { db } from "@/lib/supabase/server";

export interface ConsumeSessionUnitsInput {
  ownerId: string;
  sessionId: string;
  costNanos: number;
  acsSearches: number;
  geminiCalls: number;
  inputTokens?: number;
  cachedTokens?: number;
  outputTokens?: number;
  model?: string | null;
  cycleStartIso: string;
  includedAllowance: number;
  idempotencyKey: string;
  source?: UsageSurface | null;
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
    p_balance_floor: 0,
    p_source: input.source ?? null,
    p_input_tokens: input.inputTokens ?? 0,
    p_cached_tokens: input.cachedTokens ?? 0,
    p_output_tokens: input.outputTokens ?? 0,
    p_model: input.model ?? null,
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

export interface BillingGap {
  ownerId: string;
  costNanos: number;
  unitsNanos: number;
  gapNanos: number;
}

const RECONCILE_DAYS = 30;

/**
 * Merchants whose turns over the last month cost more (or less) than the units burned for them by
 * more than one unit. Within any window that difference is only the change in the merchant's carry,
 * which is always under one unit, so anything larger means a charge was lost or doubled.
 */
export async function findBillingGaps(): Promise<BillingGap[]> {
  const since = new Date(Date.now() - RECONCILE_DAYS * 86_400_000).toISOString();
  const { data, error } = await db
    .from("session_billing_daily")
    .select("owner_id, cost_nanos, units_nanos")
    .gte("day", since);
  if (error) {
    console.error("[db/session-usage findBillingGaps]", error);
    return [];
  }
  const byOwner = new Map<string, { cost: number; units: number }>();
  for (const row of (data ?? []) as Array<{ owner_id: string; cost_nanos: number | string; units_nanos: number | string }>) {
    const entry = byOwner.get(row.owner_id) ?? { cost: 0, units: 0 };
    entry.cost += Number(row.cost_nanos) || 0;
    entry.units += Number(row.units_nanos) || 0;
    byOwner.set(row.owner_id, entry);
  }
  return [...byOwner]
    .map(([ownerId, totals]) => ({
      ownerId,
      costNanos: totals.cost,
      unitsNanos: totals.units,
      gapNanos: totals.cost - totals.units,
    }))
    .filter((gap) => Math.abs(gap.gapNanos) > SESSION_UNIT_NANOS);
}

/** Whole session units completed since the start of the billing cycle. Summed in the database: a
 *  busy store records thousands of turns a cycle, and reading every row back to add them up here
 *  made this one of the heaviest reads on the chat path. */
export async function getSessionUnitsUsedForOwner(ownerId: string, sinceIso: string): Promise<number> {
  const summed = await db.rpc("session_units_used", { p_owner_id: ownerId, p_since: sinceIso });
  if (!summed.error) return Number(summed.data ?? 0);

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
