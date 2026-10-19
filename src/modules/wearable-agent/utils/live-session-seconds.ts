/**
 * Decart's `generationTick.seconds` counts from 0 on every connection, and a camera flip opens a
 * new one. The seconds already used in the live session before it are carried forward so the billed
 * total, and the 90-second cap that applies to it, cover the whole session.
 */
export function sessionSeconds(carriedSeconds: number, tickSeconds: number): number {
  const carried = Number.isFinite(carriedSeconds) && carriedSeconds > 0 ? carriedSeconds : 0;
  const tick = Number.isFinite(tickSeconds) && tickSeconds > 0 ? tickSeconds : 0;
  return carried + tick;
}
