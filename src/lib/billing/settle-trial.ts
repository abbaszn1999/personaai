import type Stripe from "stripe";
import { applyTrialCarryover, getLiveTrialSubscription } from "@/lib/db/billing";
import { getStripe } from "@/lib/stripe/client";
import { getPlanTier } from "@/modules/billing/constants";
import { trialPeriodOpen, trialWasPaid } from "./trial-carryover";

/** Set on subscriptions an admin grants without payment. */
export const COMPED_METADATA_KEY = "autommerce_comped";

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "resource_missing");
}

/** Moves unused units from a paid Trial into the wallets, then ends Trial without refunding the $450. */
export async function settleTrialOnUpgrade(userId: string): Promise<void> {
  const trial = await getLiveTrialSubscription(userId);
  if (!trial) return;

  let current: Stripe.Subscription | null = null;
  try {
    current = await getStripe().subscriptions.retrieve(trial.stripeSubscriptionId);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  const status = current?.status ?? trial.status;
  const comped = current?.metadata?.[COMPED_METADATA_KEY] === "true" || Boolean(current?.trial_end);

  if (trialWasPaid(status, comped) && trialPeriodOpen(trial.currentPeriodEnd)) {
    if (!trial.currentPeriodStart) throw new Error("Trial subscription has no billing period start");
    const allowance = getPlanTier("trial");
    await applyTrialCarryover({
      userId,
      trialSubscriptionId: trial.stripeSubscriptionId,
      periodStartIso: trial.currentPeriodStart,
      sessionAllowance: allowance.monthlySessionUnits,
      liveAllowanceSeconds: allowance.monthlyLiveTryOnSeconds,
      garmentAllowance: allowance.monthlyGarmentUnits,
    });
  }

  if (!current || current.status === "canceled" || current.status === "incomplete_expired") return;
  await getStripe().subscriptions.cancel(trial.stripeSubscriptionId, {
    prorate: false,
    invoice_now: false,
  });
}
