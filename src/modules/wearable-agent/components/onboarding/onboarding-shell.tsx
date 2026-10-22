"use client";

import * as React from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { OnboardingPhase } from "@/modules/wearable-agent/types";
import { useKeepFocusedFieldVisible } from "@/lib/hooks/use-visual-viewport";
import { SAFE_BOTTOM } from "../../mobile-surface";

/** Steps that get the shared chrome (back button + progress bar + slide transition). Avatar
 *  generation and selection keep their own full-bleed screens, unchanged from before. */
const STEP_SEQUENCE: OnboardingPhase[] = ["audience", "measurements"];

/** What the progress bar shows. The last entry is the avatar being built, which has its own screen
 *  outside this shell; it is listed so the shopper can see how much is left. */
const PROGRESS_STEPS = [{ label: "Who" }, { label: "Fit" }, { label: "Avatar" }] as const;

interface OnboardingShellProps {
  step: OnboardingPhase;
  onBack?: () => void;
  /** Fixed action area under the content — omitted entirely for self-advancing steps
   *  (e.g. picking an audience card) so there's no dead space below them. */
  footer?: React.ReactNode;
  /** True for real embeds, where the ProfileSwitcher pill floats over this shell's top-left
   *  corner. A short strip keeps the back button and progress row clear of that pill. */
  reserveTopSpace?: boolean;
  children: React.ReactNode;
}

/** Shared frame for the pre-avatar-generation onboarding steps: a back button + progress bar,
 *  the step's own content with a directional slide-in, and an optional footer for the primary
 *  action. Kept deliberately free of any animation library — see slide-in-right/slide-in-left
 *  in globals.css — so this costs ~0kb on top of the widget bundle. */
export function OnboardingShell({ step, onBack, footer, children, reserveTopSpace = false }: OnboardingShellProps) {
  const stepIndex = Math.max(0, STEP_SEQUENCE.indexOf(step));

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
    <div
      ref={rootRef}
      className={cn(
        "flex min-h-full flex-1 flex-col justify-between gap-4 px-4 pb-5 @md:gap-5 @md:px-6 @md:pb-6",
        reserveTopSpace ? "pt-12" : "pt-4 @md:pt-6"
      )}
    >
      <div className="flex items-center gap-3">
        {stepIndex > 0 ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-card)] text-[var(--color-text-secondary)] shadow-[var(--shadow-card)] transition-colors hover:bg-[var(--color-surface-base)] hover:text-[var(--color-text-primary)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : (
          <div className="h-9 w-9 shrink-0" aria-hidden />
        )}

        <div
          className="mx-auto flex max-w-xs flex-1 items-start gap-1.5"
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuenow={stepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={PROGRESS_STEPS.length}
          aria-valuetext={`Step ${stepIndex + 1} of ${PROGRESS_STEPS.length}: ${PROGRESS_STEPS[stepIndex]?.label ?? ""}`}
        >
          {PROGRESS_STEPS.map((progressStep, i) => (
            <div key={progressStep.label} className="flex min-w-0 flex-1 flex-col gap-1">
              <span
                className={cn(
                  "h-1 rounded-full transition-all duration-500",
                  i <= stepIndex ? "gradient-brand" : "bg-[var(--color-border)]",
                  i === stepIndex && "shadow-[0_0_8px_-1px_var(--color-brand)]"
                )}
              />
              <span
                className={cn(
                  "truncate text-center text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors",
                  i === stepIndex
                    ? "text-[var(--color-text-primary)]"
                    : i < stepIndex
                      ? "text-[var(--color-text-secondary)]"
                      : "text-[var(--color-text-muted)]"
                )}
              >
                {progressStep.label}
              </span>
            </div>
          ))}
        </div>

        <div className="h-9 w-9 shrink-0" aria-hidden />
      </div>

      <div
        key={step}
        className={cn(
          "flex flex-1 flex-col justify-center",
          direction === "back" ? "animate-slide-left" : "animate-slide-right"
        )}
      >
        {children}
      </div>

      {footer && <div className={cn("flex flex-col items-center gap-1.5 pt-1", SAFE_BOTTOM)}>{footer}</div>}
    </div>
  );
}
