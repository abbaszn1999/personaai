import { db } from "@/lib/supabase/server";

export type ImageGenerationKind = "avatar" | "try_on";

/**
 * Atomically consumes the monthly included allowance first, then one purchased credit,
 * and logs the generation. Returns false only when both pools are exhausted.
 */
export async function consumeImageGeneration(
  userId: string,
  kind: ImageGenerationKind,
  cycleStartIso: string,
  includedAllowance: number
): Promise<boolean> {
  const { data, error } = await db.rpc("consume_image_generation", {
    p_user_id: userId,
    p_kind: kind,
    p_cycle_start: cycleStartIso,
    p_included_allowance: includedAllowance,
  });

  if (error) {
    console.error("[db/image-generations consumeImageGeneration]", error);
    return false;
  }

  return data === true;
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
