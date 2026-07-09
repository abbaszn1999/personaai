"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { PlanTier } from "../types";

interface PlanCardProps {
  plan: PlanTier;
  isActive: boolean;
  onSelect: () => void;
}

export function PlanCard({ plan, isActive, onSelect }: PlanCardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-xl)] border p-5 flex flex-col gap-4 transition-all",
        isActive
          ? "border-[var(--color-brand)] bg-[var(--color-brand-light)]"
          : "border-[var(--color-border)] hover:border-[var(--color-brand)]/40"
      )}
    >
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-[var(--color-text-primary)]">{plan.name}</p>
          {isActive && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-brand)] text-white">
              Current
            </span>
          )}
        </div>
        <p className="text-xl font-display font-extrabold text-[var(--color-text-primary)] mt-1">
          {plan.priceLabel}
          <span className="text-xs font-normal text-[var(--color-text-muted)]">{plan.priceSub}</span>
        </p>
        <p className="text-xs text-[var(--color-text-secondary)] mt-2">{plan.description}</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">{plan.bestFor}</p>
      </div>

      <ul className="space-y-1.5 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-1.5 text-xs text-[var(--color-text-secondary)]">
            <Check className="h-3.5 w-3.5 text-[var(--color-success)] shrink-0 mt-0.5" />
            {f}
          </li>
        ))}
      </ul>

      <div className="space-y-1.5">
        <Button
          size="md"
          variant={isActive ? "secondary" : "primary"}
          disabled={isActive || plan.isContactOnly}
          onClick={plan.isContactOnly ? undefined : onSelect}
          className="w-full"
        >
          {isActive ? "Current Plan" : plan.isContactOnly ? "Contact Us to Enable" : "Switch to this plan"}
        </Button>
        {plan.isContactOnly && !isActive && (
          <p className="text-[11px] text-[var(--color-text-muted)] text-center">
            Requires a custom contract — contact your account manager to enable this plan.
          </p>
        )}
      </div>
    </div>
  );
}
