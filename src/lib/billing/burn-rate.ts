const MS_PER_DAY = 86_400_000;

export interface UsageProjection {
  dailyBurn: number;
  projectedCycleTotal: number;
  /** Days the remaining balance lasts at the current burn. Null when nothing has been used yet. */
  daysOfBalance: number | null;
}

/**
 * Daily burn is usage so far divided by the fraction of the cycle that has elapsed.
 * The projection extends that rate across the whole cycle. A cycle with no elapsed time,
 * or no usage, does not invent a burn.
 */
export function projectUsage(input: {
  used: number;
  elapsedMs: number;
  cycleLengthMs: number;
  remaining: number;
}): UsageProjection {
  const used = Number.isFinite(input.used) ? Math.max(0, input.used) : 0;
  const elapsedMs = Number.isFinite(input.elapsedMs) ? Math.max(0, input.elapsedMs) : 0;
  const cycleLengthMs = Number.isFinite(input.cycleLengthMs) ? Math.max(0, input.cycleLengthMs) : 0;
  const remaining = Number.isFinite(input.remaining) ? Math.max(0, input.remaining) : 0;
  const elapsedDays = elapsedMs / MS_PER_DAY;
  if (elapsedDays <= 0 || used === 0) {
    return { dailyBurn: 0, projectedCycleTotal: used, daysOfBalance: null };
  }
  const dailyBurn = used / elapsedDays;
  const cycleDays = Math.max(cycleLengthMs, elapsedMs) / MS_PER_DAY;
  return {
    dailyBurn,
    projectedCycleTotal: dailyBurn * cycleDays,
    daysOfBalance: remaining / dailyBurn,
  };
}
