"use client";

import { useBillingStore } from "../store";
import { MONTHLY_INCLUDED_RENDERS, PLAN_TIERS } from "../constants";

export function useBilling() {
  const {
    activeTierId,
    rendersUsed,
    overageCredits,
    lastPurchasedBundleId,
    openaiApiKey,
    switchTier,
    purchaseBundle,
    setOpenaiApiKey,
  } = useBillingStore();

  const activeTier = PLAN_TIERS.find((t) => t.id === activeTierId) ?? PLAN_TIERS[0];
  const rendersRemaining = Math.max(MONTHLY_INCLUDED_RENDERS - rendersUsed, 0);
  const percentUsed = Math.min((rendersUsed / MONTHLY_INCLUDED_RENDERS) * 100, 100);
  const isOverCap = rendersUsed >= MONTHLY_INCLUDED_RENDERS;

  return {
    activeTier,
    activeTierId,
    rendersUsed,
    rendersRemaining,
    percentUsed,
    isOverCap,
    overageCredits,
    lastPurchasedBundleId,
    openaiApiKey,
    switchTier,
    purchaseBundle,
    setOpenaiApiKey,
  };
}
