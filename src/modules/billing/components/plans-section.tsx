"use client";

import { SettingsCard } from "@/components/ui/settings-card";
import { PlanCard } from "./plan-card";
import { useBilling } from "../hooks/use-billing";

export function PlansSection() {
  const { summary, tiers, switchTier, pendingAction } = useBilling();
  const activeTierId = summary?.tierId ?? "trial";
  const hasPaidSubscription =
    summary?.billing.accessMode === "stripe" && Boolean(summary.billing.subscriptionStatus);

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
            isActive={hasPaidSubscription && plan.id === activeTierId}
            loading={pendingAction === `plan:${plan.id}`}
            disabled={pendingAction !== null}
            onSelect={() => void switchTier(plan.id)}
          />
        ))}
      </div>
    </SettingsCard>
  );
}
