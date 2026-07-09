"use client";

import { useBillingStore } from "../store";
import { MONTHLY_INCLUDED_RENDERS, getPlanTiers } from "../constants";
import type { WorkspaceMode } from "@/modules/workspaces/types";

export function useBilling(mode: WorkspaceMode = "wearable") {
  const {
    activeTierId,
    rendersUsed,
    overageCredits,
    lastPurchasedBundleId,
    switchTier,
    purchaseBundle,
  } = useBillingStore();

  const tiers = getPlanTiers(mode);
  const activeTier = tiers.find((t) => t.id === activeTierId) ?? tiers[0];
  const rendersRemaining = Math.max(MONTHLY_INCLUDED_RENDERS - rendersUsed, 0);
  const percentUsed = Math.min((rendersUsed / MONTHLY_INCLUDED_RENDERS) * 100, 100);
  const isOverCap = rendersUsed >= MONTHLY_INCLUDED_RENDERS;

  return {
    activeTier,
    tiers,
    activeTierId,
    rendersUsed,
    rendersRemaining,
    percentUsed,
    isOverCap,
    overageCredits,
    lastPurchasedBundleId,
    switchTier,
    purchaseBundle,
  };
}
