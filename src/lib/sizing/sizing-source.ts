/**
 * Where a connection's per-product size charts come from.
 *
 * A store that already keeps a chart on every product has nothing for setup stages 2-5 to discover,
 * research or assign, so this is what lets those stages be skipped — and, more importantly, what the
 * recommendation path reads afterwards to know which store of charts to size against. Two facts in one
 * value because they are the same fact: the pipeline's charts exist only if the pipeline ran.
 *
 * Its own module rather than a union inside `store-connections.ts` because Stage 1's table is client
 * code and needs the same vocabulary the row is written with.
 */
export const SIZING_SOURCES = ["ai_pipeline", "merchant_charts"] as const;

export type SizingSource = (typeof SIZING_SOURCES)[number];

export function isSizingSource(value: unknown): value is SizingSource {
  return typeof value === "string" && (SIZING_SOURCES as readonly string[]).includes(value);
}

/** Anything unrecognised reads as the pipeline, which is the safe direction: a store wrongly marked as
 *  having its own charts would be skipped past the only stages that could produce any. */
export function parseSizingSource(value: unknown): SizingSource {
  return isSizingSource(value) ? value : "ai_pipeline";
}
