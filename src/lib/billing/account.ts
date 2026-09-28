import { resolveAccountBillingCycle } from "./cycle";
import {
  resolveEntitlement,
  type BillingEntitlementStatus,
} from "./entitlement";
import { allocateImageUnits } from "./image-units";
import { AVATAR_IMAGE_NANOS, GARMENT_UNIT_NANOS } from "./pricing";
import { getImageUnitsUsed } from "@/lib/db/image-generations";
import { getLiveTryOnSecondsUsedForOwner } from "@/lib/db/realtime-tryon-events";
import { getSessionUnitsUsedForOwner } from "@/lib/db/session-usage";
import { getUserById, type UserRow } from "@/lib/db/users";
import { applyBillingRollover } from "@/lib/db/billing-rollover";
import {
  overageBlocksCharge,
  overageCentsFromMicro,
  overageMicroCents,
  walletHeadroom,
} from "./wallets";
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
  sessionUnitsUsedThisCycle: number;
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
  const tierId = subscription?.tierId ?? user.subscription_tier;
  const tier = getPlanTier(tierId);
  let accountUser = user;
  try {
    const rolled = await applyBillingRollover({
      userId,
      cycleStartIso,
      carries: tier.carriesBalance,
      sessionAllowance: tier.monthlySessionUnits,
      liveAllowanceSeconds: tier.monthlyLiveTryOnSeconds,
      garmentAllowance: tier.monthlyGarmentUnits,
    });
    if (rolled) {
      const refreshed = await getUserById(userId);
      if (refreshed) accountUser = refreshed;
    }
  } catch (error) {
    console.error("[billing/account rollover]", error);
  }

  const [imagesUsedThisCycle, liveTryOnSecondsUsedThisCycle, sessionUnitsUsedThisCycle] = await Promise.all([
    getImageUnitsUsed(userId, cycleStartIso),
    getLiveTryOnSecondsUsedForOwner(userId, cycleStartIso),
    getSessionUnitsUsedForOwner(userId, cycleStartIso),
  ]);

  const accessMode = account?.accessMode ?? "stripe";
  const entitlement = resolveEntitlement(accessMode, subscription);

  return {
    user: accountUser,
    tier,
    cycleStartIso,
    cycleEndIso: cycle.end.toISOString(),
    imagesUsedThisCycle,
    liveTryOnSecondsUsedThisCycle,
    sessionUnitsUsedThisCycle,
    accessMode,
    subscription,
    entitlementStatus: entitlement.status,
    entitled: entitlement.entitled,
    hasStripeCustomer: Boolean(account?.stripeCustomerId),
  };
}

export function cycleOverageMicroCents(context: AccountBillingContext): number {
  return overageMicroCents({
    sessionOverageUnits: context.sessionUnitsUsedThisCycle - context.tier.monthlySessionUnits,
    liveOverageSeconds: context.liveTryOnSecondsUsedThisCycle - context.tier.monthlyLiveTryOnSeconds,
    garmentOverageUnits: context.imagesUsedThisCycle - context.tier.monthlyGarmentUnits,
  });
}

function capAllowsOverage(context: AccountBillingContext, addsOverage: boolean): boolean {
  return !overageBlocksCharge({
    capCents: context.user.overage_cap_cents ?? null,
    overageMicroCents: cycleOverageMicroCents(context),
    addsOverage,
  });
}

/** Best-effort pre-check before calling Pruna. `costNanos` is the render's real cost; the DB is
 *  authoritative and applies the exact split with the account's nano carry. Units are rounded up
 *  here so the guard never green-lights a charge the balance cannot cover. */
export function canGenerateImage(context: AccountBillingContext, costNanos = AVATAR_IMAGE_NANOS): boolean {
  const allowance = context.tier.monthlyGarmentUnits;
  const units = Math.max(1, Math.ceil(costNanos / GARMENT_UNIT_NANOS));
  const charge = allocateImageUnits({
    usedThisCycle: context.imagesUsedThisCycle,
    includedAllowance: allowance,
    units,
    credits: context.user.credits,
  });
  if (!context.entitled || !charge) return false;
  return capAllowsOverage(context, charge.fromCredits > 0);
}

export function canStartLiveTryOn(context: AccountBillingContext): boolean {
  if (!context.entitled) return false;
  const included = context.tier.monthlyLiveTryOnSeconds;
  const includedRemaining = Math.max(included - context.liveTryOnSecondsUsedThisCycle, 0);
  const headroom = walletHeadroom({
    used: context.liveTryOnSecondsUsedThisCycle,
    included,
    balance: context.user.live_tryon_seconds_balance,
  });
  if (headroom <= 0) return false;
  return capAllowsOverage(context, includedRemaining <= 0);
}

/** Chat is refused once the session grace floor or the shared spend cap is already hit. */
export function canStartSessionTurn(context: AccountBillingContext): boolean {
  if (!context.entitled) return false;
  const included = context.tier.monthlySessionUnits;
  const includedRemaining = Math.max(included - context.sessionUnitsUsedThisCycle, 0);
  const headroom = walletHeadroom({
    used: context.sessionUnitsUsedThisCycle,
    included,
    balance: context.user.session_units_balance,
  });
  if (headroom <= 0) return false;
  return capAllowsOverage(context, includedRemaining <= 0);
}

export { overageCentsFromMicro };

export function canUsePaidPlatform(context: AccountBillingContext): boolean {
  return context.entitled;
}
