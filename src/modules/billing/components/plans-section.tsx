"use client";

import { SettingsSection } from "@/components/ui/settings-section";
import { Crown } from "lucide-react";
import { PlanCard } from "./plan-card";
import { useBilling } from "../hooks/use-billing";
import { getInfraNotes } from "../constants";
import type { WorkspaceMode } from "@/modules/workspaces/types";

interface PlansSectionProps {
  mode: WorkspaceMode;
}

export function PlansSection({ mode }: PlansSectionProps) {
  const { activeTierId, tiers, switchTier } = useBilling(mode);
  const infraNotes = getInfraNotes(mode);

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
            isActive={plan.id === activeTierId}
            onSelect={() => switchTier(plan.id)}
          />
        ))}
      </div>

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
