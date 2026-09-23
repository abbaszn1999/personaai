import type { PlanTierId } from "@/modules/billing/types";

export const LIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "incomplete"] as const;

/** Paid (or in the past-due grace path). `incomplete` is live but not yet paid. */
const SETTLED = new Set<string>(["active", "trialing", "past_due"]);

export interface RankedSubscription {
  status: string;
  tierId: PlanTierId;
  updatedAt: string;
}

/**
 * A paid subscription outranks an unpaid one, which outranks an ended one; then Main outranks
 * Trial. So a Main checkout still waiting on payment cannot take access away from a paid Trial,
 * and canceling Trial after an upgrade cannot make the account look like Trial again.
 */
export function pickCurrentSubscription<T extends RankedSubscription>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return [...rows].sort((left, right) => {
    const statusDelta = rankStatus(left.status) - rankStatus(right.status);
    if (statusDelta !== 0) return statusDelta;
    const tierDelta = rankTier(left.tierId) - rankTier(right.tierId);
    if (tierDelta !== 0) return tierDelta;
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  })[0];
}

function rankStatus(status: string): number {
  if (SETTLED.has(status)) return 0;
  if (status === "incomplete") return 1;
  return 2;
}

function rankTier(tierId: PlanTierId): number {
  return tierId === "main" ? 0 : 1;
}
