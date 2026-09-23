import { GMV_COMMISSION_RATE, GMV_MIN_COMMISSION_CENTS } from "@/lib/billing/pricing";

export interface CommissionEntry {
  amountUsdCents: number;
  billable: boolean;
  charged: boolean;
}

export interface CommissionResult {
  /** Net USD cents of the entries that were eligible to bill. May be negative. */
  gmvUsdCents: number;
  /** What to put on the invoice. Zero when the balance is deferred. */
  commissionUsdCents: number;
  /** True when nothing is invoiced and the rows stay open for a later invoice. */
  deferred: boolean;
}

/**
 * 3% of unbilled billable GMV, rounded to the nearest cent.
 * A non-positive balance, or a commission under Stripe's minimum, is not invoiced.
 */
export function computeCommission(
  entries: CommissionEntry[],
  rate = GMV_COMMISSION_RATE,
  minimumCents = GMV_MIN_COMMISSION_CENTS
): CommissionResult {
  const gmvUsdCents = entries
    .filter((entry) => entry.billable && !entry.charged)
    .reduce((sum, entry) => sum + entry.amountUsdCents, 0);

  if (gmvUsdCents <= 0) {
    return { gmvUsdCents, commissionUsdCents: 0, deferred: true };
  }

  const commissionUsdCents = Math.round(gmvUsdCents * rate);
  if (commissionUsdCents < minimumCents) {
    return { gmvUsdCents, commissionUsdCents: 0, deferred: true };
  }

  return { gmvUsdCents, commissionUsdCents, deferred: false };
}
