import { GARMENT_UNIT_NANOS, type UsageSurface } from "@/lib/billing/pricing";
import { graceFloor } from "@/lib/billing/wallets";
import { maybeAlertWalletUsage } from "@/lib/billing/usage-alerts";
import { db } from "@/lib/supabase/server";

export type ImageGenerationKind = "avatar" | "try_on";

export interface ImageUsageAttribution {
  sessionId?: string | null;
  source?: UsageSurface | null;
}

/**
 * Atomically folds one render's real Pruna cost (`costNanos`) into the account's nano carry,
 * settles whole $0.008 units — included allowance first, then purchased credits — and logs the
 * generation. Returns the remaining purchased credit balance, or null when the balance cannot
 * cover the charge (nothing is consumed in that case).
 */
export async function consumeImageGeneration(
  userId: string,
  kind: ImageGenerationKind,
  cycleStartIso: string,
  includedAllowance: number,
  costNanos: number,
  attribution?: ImageUsageAttribution
): Promise<number | null> {
  const { data, error } = await db.rpc("consume_image_generation", {
    p_user_id: userId,
    p_kind: kind,
    p_cycle_start: cycleStartIso,
    p_included_allowance: includedAllowance,
    p_cost_nanos: costNanos,
    p_unit_nanos: GARMENT_UNIT_NANOS,
    p_balance_floor: graceFloor(includedAllowance),
    p_session_id: attribution?.sessionId ?? null,
    p_source: attribution?.source ?? null,
  });

  if (error) {
    console.error("[db/image-generations consumeImageGeneration]", error);
    return null;
  }

  if (typeof data === "number") {
    const used = await getImageUnitsUsed(userId, cycleStartIso);
    await maybeAlertWalletUsage({
      userId,
      wallet: "garments",
      used,
      allowance: includedAllowance,
      cycleStartIso,
    });
    return data;
  }

  return null;
}

/**
 * Counts image generations for a user, optionally since a given ISO timestamp.
 * Not consumed by any UI yet — written so a future usage-chart rewrite can query
 * real generation history instead of the mocked chart.
 */
export async function getImageGenerationCount(userId: string, sinceIso?: string): Promise<number> {
  let query = db
    .from("image_generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (sinceIso) {
    query = query.gte("created_at", sinceIso);
  }

  const { count, error } = await query;

  if (error) {
    console.error("[db/image-generations getImageGenerationCount]", error);
    return 0;
  }

  return count ?? 0;
}

/** Sum of billed units since a cycle start. One try-on row can be several units. */
export async function getImageUnitsUsed(userId: string, sinceIso: string): Promise<number> {
  const { data, error } = await db.rpc("image_units_used", {
    p_user_id: userId,
    p_since: sinceIso,
  });

  if (error) {
    console.error("[db/image-generations getImageUnitsUsed]", error);
    return 0;
  }

  const sum = Number(data);
  return Number.isFinite(sum) ? sum : 0;
}

export interface ImageGenerationUsageRow {
  createdAt: string;
}

export async function getImageGenerationsSince(
  userId: string,
  sinceIso: string,
  untilIso?: string
): Promise<ImageGenerationUsageRow[]> {
  let query = db
    .from("image_generations")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });

  if (untilIso) query = query.lt("created_at", untilIso);
  const { data, error } = await query;
  if (error) {
    console.error("[db/image-generations getImageGenerationsSince]", error);
    return [];
  }
  return (data ?? []).map((row) => ({ createdAt: row.created_at as string }));
}
