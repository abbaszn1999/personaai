/** How one image charge splits across the monthly include and the purchased balance.
 *  `consume_image_generation` applies this same split inside the database. */
export interface ImageUnitCharge {
  fromIncluded: number;
  fromCredits: number;
}

/**
 * Included allowance is consumed first. Returns null when the purchased balance cannot cover
 * the remainder, so a try-on is refused before Pruna is called and the database refuses the
 * same request if the balance moved in between.
 */
export function allocateImageUnits(input: {
  usedThisCycle: number;
  includedAllowance: number;
  units: number;
  credits: number;
  /** Lowest balance this charge may leave. Defaults to zero; grace passes a negative floor. */
  balanceFloor?: number;
}): ImageUnitCharge | null {
  if (!Number.isInteger(input.units) || input.units < 1) return null;
  const used = Number.isFinite(input.usedThisCycle) ? Math.max(0, Math.floor(input.usedThisCycle)) : 0;
  const allowance = Number.isFinite(input.includedAllowance)
    ? Math.max(0, Math.floor(input.includedAllowance))
    : 0;
  const credits = Number.isFinite(input.credits) ? Math.floor(input.credits) : 0;
  const floor = Number.isFinite(input.balanceFloor) ? Math.floor(input.balanceFloor as number) : 0;
  const includedRemaining = Math.max(allowance - used, 0);
  const fromIncluded = Math.min(input.units, includedRemaining);
  const fromCredits = input.units - fromIncluded;
  if (credits - fromCredits < floor) return null;
  return { fromIncluded, fromCredits };
}
