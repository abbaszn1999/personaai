"use client";

import { SettingsCard } from "@/components/ui/settings-card";
import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/billing/current-subscription";
import { PlanCard } from "./plan-card";
import { useBilling } from "../hooks/use-billing";

export function PlansSection() {
  const { summary, tiers, switchTier, pendingAction } = useBilling();
  const activeTierId = summary?.tierId ?? "trial";
  const status = summary?.billing.subscriptionStatus ?? "";
  const live = (LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
  const onTrial = live && activeTierId === "trial";

  return (
    <SettingsCard
      title="Change plan"
      description="Plan changes are processed by Stripe."
      footer="Every plan includes size charts, the style guide, size recommendations, catalog sync, and analytics."
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {tiers.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isActive={live && plan.id === activeTierId}
            loading={pendingAction === `plan:${plan.id}`}
            disabled={pendingAction !== null}
            blockedLabel={plan.id === "trial" && summary?.trialUsed && !onTrial ? "Trial used" : undefined}
            actionLabel={plan.id === "main" && onTrial ? "Upgrade to Main" : undefined}
            onSelect={() => void switchTier(plan.id)}
          />
        ))}
      </div>
    </SettingsCard>
  );
}
