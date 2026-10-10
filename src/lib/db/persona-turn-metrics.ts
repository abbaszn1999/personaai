import { db } from "@/lib/supabase/server";

export interface PersonaTurnMetric {
  connectionId: string;
  action: string;
  /** `reply`, `shown`, `empty`, `empty_size`, `exhausted` or `invalid`. */
  outcome: string;
  results: number;
  shown: number;
  retried: boolean;
  ms: number;
  cachedTokens: number;
}

/** Fire and forget: a metric that fails to land must never slow or fail the shopper's turn. */
export function recordPersonaTurn(metric: PersonaTurnMetric): void {
  void Promise.resolve(
    db.from("persona_turn_metrics").insert({
      connection_id: metric.connectionId,
      action: metric.action,
      outcome: metric.outcome,
      results: metric.results,
      shown: metric.shown,
      retried: metric.retried,
      ms: metric.ms,
      cached_tokens: metric.cachedTokens,
    })
  )
    .then(({ error }) => {
      if (error) console.warn("[db/persona-turn-metrics]", error.message);
    })
    .catch((error) => console.warn("[db/persona-turn-metrics]", error instanceof Error ? error.message : error));
}
