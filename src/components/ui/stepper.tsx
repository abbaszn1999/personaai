"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface StepperStep {
  id: string;
  label: string;
  description?: string;
}

interface StepperProps {
  steps: StepperStep[];
  currentStep: number;
  /**
   * High-water mark. Steps at or below this are reachable; everything past it stays locked, so a
   * merchant can revisit a finished stage without being able to skip one they haven't done.
   * Defaults to `currentStep` — a strictly forward wizard.
   */
  highestReachedStep?: number;
  /** Omit to render a read-only progress indicator. */
  onSelectStep?: (index: number) => void;
  className?: string;
}

export function Stepper({
  steps,
  currentStep,
  highestReachedStep,
  onSelectStep,
  className,
}: StepperProps) {
  const reachable = highestReachedStep ?? currentStep;

  return (
    <div className={cn("flex items-center", className)}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent   = index === currentStep;
        const isUpcoming  = index > currentStep;
        const isSelectable = Boolean(onSelectStep) && index <= reachable && !isCurrent;

        return (
          <React.Fragment key={step.id}>
            <button
              type="button"
              disabled={!isSelectable}
              onClick={isSelectable ? () => onSelectStep?.(index) : undefined}
              title={step.description}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-[var(--radius-md)] px-1",
                isSelectable ? "cursor-pointer" : "cursor-default",
                // Only the affordance is conditional — the layout must not shift between states.
                isSelectable && "hover:opacity-80 transition-opacity"
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300",
                  isCompleted && "gradient-brand text-white",
                  isCurrent   && "gradient-brand text-white ring-4 ring-[var(--color-brand-light)]",
                  isUpcoming  && "bg-[var(--color-surface-base)] border-2 border-[var(--color-border)] text-[var(--color-text-muted)]"
                )}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
              </div>
              <span
                className={cn(
                  "text-xs font-medium whitespace-nowrap",
                  (isCompleted || isCurrent) ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"
                )}
              >
                {step.label}
              </span>
            </button>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-3 mb-5 transition-all duration-300",
                  isCompleted ? "gradient-brand" : "bg-[var(--color-border)]"
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
