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
  className?: string;
}

export function Stepper({ steps, currentStep, className }: StepperProps) {
  return (
    <div className={cn("flex items-center", className)}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent   = index === currentStep;
        const isUpcoming  = index > currentStep;
        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-1.5">
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
            </div>
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
