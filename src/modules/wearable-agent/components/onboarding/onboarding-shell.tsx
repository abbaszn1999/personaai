"use client";

import * as React from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { OnboardingPhase } from "@/modules/wearable-agent/types";
import { useKeepFocusedFieldVisible } from "@/lib/hooks/use-visual-viewport";
import { SAFE_BOTTOM } from "../../mobile-surface";

/** Steps that get the shared chrome (back button + progress dots + slide transition). Avatar
 *  generation and selection keep their own full-bleed screens, unchanged from before. */
const STEP_SEQUENCE: OnboardingPhase[] = ["welcome", "audience", "measurements"];

interface OnboardingShellProps {
  step: OnboardingPhase;
  onBack?: () => void;
  /** Fixed action area under the content — omitted entirely for self-advancing steps
   *  (e.g. picking an audience card) so there's no dead space below them. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/** Shared frame for the pre-avatar-generation onboarding steps: a back button + progress dots
 *  (skipped on the very first step), the step's own content with a directional slide-in, and an
 *  optional fixed footer for the primary action. Kept deliberately free of any animation
 *  library — see slide-in-right/slide-in-left/scale-in in globals.css — so this costs ~0kb on
 *  top of the widget bundle. */
export function OnboardingShell({ step, onBack, footer, children }: OnboardingShellProps) {
  const stepIndex = STEP_SEQUENCE.indexOf(step);

  // Tracks which direction to slide the new step in from, purely by comparing this render's
  // `step` to the last one we actually rendered — the sanctioned "adjust state during render"
  // pattern (see react.dev "You Might Not Need an Effect"), not an effect, so the very first
  // paint of a newly-entered step already carries the right direction instead of one tick late.
  const [renderedStep, setRenderedStep] = React.useState(step);
  const [direction, setDirection] = React.useState<"forward" | "back">("forward");
  if (step !== renderedStep) {
    const prevIndex = STEP_SEQUENCE.indexOf(renderedStep);
    setDirection(stepIndex >= prevIndex ? "forward" : "back");
    setRenderedStep(step);
  }

  const rootRef = React.useRef<HTMLDivElement>(null);
  useKeepFocusedFieldVisible(rootRef);

  return (
    <div ref={rootRef} className="flex flex-col gap-6 px-6 py-8">
      {stepIndex > 0 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-base)] hover:text-[var(--color-text-primary)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div
            className="flex flex-1 items-center justify-center gap-1.5"
            role="progressbar"
            aria-label="Onboarding progress"
            aria-valuenow={stepIndex}
            aria-valuemin={1}
            aria-valuemax={STEP_SEQUENCE.length - 1}
          >
            {STEP_SEQUENCE.slice(1).map((s, i) => (
              <span
                key={s}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i <= stepIndex - 1 ? "w-6 bg-[var(--color-wearable-from)]" : "w-1.5 bg-[var(--color-border)]"
                )}
              />
            ))}
          </div>
          <div className="h-11 w-11 shrink-0" aria-hidden />
        </div>
      )}

      <div key={step} className={direction === "back" ? "animate-slide-left" : "animate-slide-right"}>
        {children}
      </div>

      {footer && <div className={cn("flex flex-col items-center gap-2 pt-1", SAFE_BOTTOM)}>{footer}</div>}
    </div>
  );
}
