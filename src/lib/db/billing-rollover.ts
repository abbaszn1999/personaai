import { db } from "@/lib/supabase/server";

/** Claims this cycle's rollover row. Returns true only for the caller that inserted it,
 *  which is also the caller that may have moved unused include into the purchased balances. */
export async function applyBillingRollover(input: {
  userId: string;
  cycleStartIso: string;
  carries: boolean;
  sessionAllowance: number;
  liveAllowanceSeconds: number;
  garmentAllowance: number;
}): Promise<boolean> {
  const { data, error } = await db.rpc("apply_billing_rollover", {
    p_user_id: input.userId,
    p_cycle_start: input.cycleStartIso,
    p_carries: input.carries,
    p_session_allowance: input.sessionAllowance,
    p_live_allowance: input.liveAllowanceSeconds,
    p_garment_allowance: input.garmentAllowance,
  });
  if (error) {
    console.error("[db/billing-rollover]", error);
    throw error;
  }
  return data === true;
}
