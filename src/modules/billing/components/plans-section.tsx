"use client";

import { SettingsSection } from "@/components/ui/settings-section";
import { Crown } from "lucide-react";
import { PlanCard } from "./plan-card";
import { useBilling } from "../hooks/use-billing";
import { getInfraNotes } from "../constants";
export function PlansSection() {
  const { summary, tiers, switchTier, pendingAction, error } = useBilling();
  const activeTierId = summary?.tierId ?? "trial";
  const hasPaidSubscription =
    summary?.billing.accessMode === "stripe" &&
    Boolean(summary.billing.subscriptionStatus);
  const infraNotes = getInfraNotes();

  return (
    <SettingsSection
      title="Plans"
      description="Choose the commercial tier that fits how your store sells"
      icon={<Crown className="h-4 w-4" />}
      accent="brand"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      {error && <p className="mt-3 text-sm text-[var(--color-error)]">{error}</p>}

      <ul className="mt-5 space-y-1.5">
        {infraNotes.map((note) => (
          <li key={note} className="text-xs text-[var(--color-text-muted)] flex items-start gap-1.5">
            <span className="h-1 w-1 rounded-full bg-[var(--color-text-muted)] shrink-0 mt-1.5" />
            {note}
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}
