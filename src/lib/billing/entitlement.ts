import type { BillingSubscriptionRow } from "@/lib/db/billing";
import { getStripePastDueGraceDays } from "@/lib/stripe/config";

export type BillingEntitlementStatus =
  | "legacy_test"
  | "active"
  | "trialing"
  | "past_due_grace"
  | "past_due"
  | "inactive";

export function resolveEntitlement(
  accessMode: "stripe" | "legacy_test",
  subscription: BillingSubscriptionRow | null,
  now = new Date()
): { status: BillingEntitlementStatus; entitled: boolean } {
  if (accessMode === "legacy_test") {
    return { status: "legacy_test", entitled: true };
  }
  if (!subscription) return { status: "inactive", entitled: false };
  if (subscription.status === "active" || subscription.status === "trialing") {
    return {
      status: subscription.status,
      entitled: true,
    };
  }
  if (subscription.status === "past_due" && subscription.currentPeriodEnd) {
    const graceEnd = new Date(subscription.currentPeriodEnd);
    graceEnd.setUTCDate(graceEnd.getUTCDate() + getStripePastDueGraceDays());
    if (now <= graceEnd) return { status: "past_due_grace", entitled: true };
    return { status: "past_due", entitled: false };
  }
  return { status: "inactive", entitled: false };
}
