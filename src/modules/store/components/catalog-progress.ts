export interface CatalogProgressView {
  /** Whole-number percent, never 100 — 100% is only ever shown by the gate unlocking. */
  percent: number;
  /** The counter has reached the total but the catalog hasn't been marked ready yet. */
  finalizing: boolean;
}

/**
 * Display-only view of a catalog index run that is still in flight.
 *
 * The stored counter is a running tally that can reach its total (and double-count on retries)
 * while queued products are still being written; the catalog only counts as ready once the queue
 * is empty and the status flips. So while the status is still "indexing" the bar must never claim
 * 100% — it holds at 99% and says it is finishing up instead.
 */
export function catalogProgressView(progress: number, total: number): CatalogProgressView {
  if (total <= 0) return { percent: 0, finalizing: false };
  const raw = Math.round((Math.max(0, progress) / total) * 100);
  return { percent: Math.min(99, raw), finalizing: progress >= total };
}
