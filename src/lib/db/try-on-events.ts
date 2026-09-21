import { db } from "@/lib/supabase/server";

export interface RecordTryOnEventsInput {
  workspaceId: string;
  sessionId: string;
  generationId: string;
  items: Array<{ productId: string; productName: string; recommendedSize: string }>;
}

/** Logs every garment shown in one virtual try-on render the widget generated (button or
 *  chat-triggered) — see the `try_on` SSE event / generateTryOn in use-try-on-agent.ts, the
 *  only caller. Powers the "Virtual Try-On Insights" card in src/lib/db/analytics.ts. */
export async function recordTryOnEvents(input: RecordTryOnEventsInput): Promise<void> {
  if (input.items.length === 0) return;

  const { error } = await db.from("try_on_events").insert(
    input.items.map((item) => ({
      // `workspace_id` was dropped from this table — "workspace" and "owner" are the same
      // thing now, so this stays keyed on owner_id under the hood.
      owner_id: input.workspaceId,
      session_id: input.sessionId,
      generation_id: input.generationId,
      product_id: item.productId,
      product_name: item.productName,
      recommended_size: item.recommendedSize,
    }))
  );

  if (error) {
    console.error("[db/try-on-events recordTryOnEvents]", error);
  }
}

export interface TryOnEventRow {
  sessionId: string;
  generationId: string;
  productId: string;
  productName: string;
  recommendedSize: string;
  createdAt: string;
}

/** Raw rows for a workspace within [sinceIso, untilIso) — aggregated in application code by
 *  src/lib/db/analytics.ts, matching the same simple-JS-aggregation pattern as cart_events. */
export async function getTryOnEventsInRange(
  workspaceId: string,
  sinceIso: string,
  untilIso: string
): Promise<TryOnEventRow[]> {
  const { data, error } = await db
    .from("try_on_events")
    .select("session_id, generation_id, product_id, product_name, recommended_size, created_at")
    .eq("owner_id", workspaceId)
    .gte("created_at", sinceIso)
    .lt("created_at", untilIso);

  if (error) {
    console.error("[db/try-on-events getTryOnEventsInRange]", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    sessionId: row.session_id as string,
    generationId: row.generation_id as string,
    productId: row.product_id as string,
    productName: row.product_name as string,
    recommendedSize: row.recommended_size as string,
    createdAt: row.created_at as string,
  }));
}
