import { resolveAccountBillingCycle } from "./cycle";
import {
  resolveEntitlement,
  type BillingEntitlementStatus,
} from "./entitlement";
import { getImageGenerationCount } from "@/lib/db/image-generations";
import { getLiveTryOnSecondsUsedForOwner } from "@/lib/db/realtime-tryon-events";
import { getUserById, type UserRow } from "@/lib/db/users";
import {
  getLatestBillingSubscription,
  getOrCreateBillingAccount,
  type BillingAccessMode,
  type BillingSubscriptionRow,
} from "@/lib/db/billing";
import { getPlanTier } from "@/modules/billing/constants";
import type { PlanTier } from "@/modules/billing/types";

export interface AccountBillingContext {
  user: UserRow;
  tier: PlanTier;
  cycleStartIso: string;
  cycleEndIso: string;
  imagesUsedThisCycle: number;
  liveTryOnSecondsUsedThisCycle: number;
  accessMode: BillingAccessMode;
  subscription: BillingSubscriptionRow | null;
  entitlementStatus: BillingEntitlementStatus;
  entitled: boolean;
  hasStripeCustomer: boolean;
}

export async function getAccountBillingContext(userId: string): Promise<AccountBillingContext | null> {
  const [user, account, subscription] = await Promise.all([
    getUserById(userId),
    getOrCreateBillingAccount(userId),
    getLatestBillingSubscription(userId),
  ]);
  if (!user) return null;

  const cycle = resolveAccountBillingCycle({
    accountCreatedAtIso: user.created_at,
    accessMode: account?.accessMode ?? "stripe",
    stripePeriodStartIso: subscription?.currentPeriodStart,
    stripePeriodEndIso: subscription?.currentPeriodEnd,
  });
  const cycleStartIso = cycle.start.toISOString();
  const [imagesUsedThisCycle, liveTryOnSecondsUsedThisCycle] = await Promise.all([
    getImageGenerationCount(userId, cycleStartIso),
    getLiveTryOnSecondsUsedForOwner(userId, cycleStartIso),
  ]);

  const accessMode = account?.accessMode ?? "stripe";
  const entitlement = resolveEntitlement(accessMode, subscription);
  const tierId = subscription?.tierId ?? user.subscription_tier;

  return {
    user,
    tier: getPlanTier(tierId),
    cycleStartIso,
    cycleEndIso: cycle.end.toISOString(),
    imagesUsedThisCycle,
    liveTryOnSecondsUsedThisCycle,
    accessMode,
    subscription,
    entitlementStatus: entitlement.status,
    entitled: entitlement.entitled,
    hasStripeCustomer: Boolean(account?.stripeCustomerId),
  };
}

export function canGenerateImage(context: AccountBillingContext): boolean {
  return (
    context.entitled &&
    (
      context.imagesUsedThisCycle < context.tier.monthlyRenders ||
      context.user.credits > 0
    )
  );
}

export function canStartLiveTryOn(context: AccountBillingContext): boolean {
  return (
    context.entitled &&
    (
      context.liveTryOnSecondsUsedThisCycle < context.tier.monthlyLiveTryOnSeconds ||
      context.user.live_tryon_seconds_balance > 0
    )
  );
}

export function canUsePaidPlatform(context: AccountBillingContext): boolean {
  return context.entitled;
}
