"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/settings-card";
import { cn } from "@/lib/utils/cn";
import type { PlanTier } from "../types";

interface PlanCardProps {
  plan: PlanTier;
  isActive: boolean;
  loading?: boolean;
  disabled?: boolean;
  /** Replaces the switch label and keeps the button disabled. */
  blockedLabel?: string;
  actionLabel?: string;
  onSelect: () => void;
}

export function PlanCard({
  plan,
  isActive,
  loading = false,
  disabled = false,
  blockedLabel,
  actionLabel,
  onSelect,
}: PlanCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-[var(--radius-xl)] border p-5",
        isActive
          ? "border-[var(--color-brand)] bg-[var(--color-brand-light)]"
          : "border-[var(--color-border)] bg-[var(--color-surface-base)]"
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">{plan.name}</p>
          {isActive && <StatusBadge tone="success">Current</StatusBadge>}
        </div>
        <p className="mt-1 text-2xl font-display font-extrabold text-[var(--color-text-primary)]">
          {plan.priceLabel}
          <span className="text-xs font-normal text-[var(--color-text-muted)]">{plan.priceSub}</span>
        </p>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">{plan.bestFor}</p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">{plan.description}</p>
      </div>

      <ul className="flex-1 space-y-2">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-[var(--color-text-secondary)]">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]" />
            {feature}
          </li>
        ))}
      </ul>

      <Button
        size="md"
        variant={isActive ? "secondary" : "primary"}
        disabled={isActive || disabled || Boolean(blockedLabel)}
        loading={loading}
        onClick={onSelect}
        className="w-full"
      >
        {isActive ? "Current plan" : blockedLabel ?? actionLabel ?? `Switch to ${plan.name}`}
      </Button>
    </div>
  );
}
