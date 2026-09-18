"use client";

import * as React from "react";
import { Check, ChevronRight, FastForward, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { StageNumber } from "../types";

interface StepMeta {
  stage: StageNumber;
  title: string;
  shortLabel: string;
  aiPowered?: boolean;
}

const STEPS: StepMeta[] = [
  { stage: 1, title: "Column Mapping", shortLabel: "Mapping" },
  { stage: 2, title: "Item Preview", shortLabel: "Preview" },
  { stage: 3, title: "Brand Discovery", shortLabel: "Brands", aiPowered: true },
  { stage: 4, title: "Size Chart Research", shortLabel: "Charts", aiPowered: true },
  // Gap Filling was stage 5 until doc Part 4 made it a modal on Stage 4 — a step every merchant
  // walked through even with nothing to fill, one screen away from the results that defined it. Doc
  // Part 7's Chart Assignment took the slot.
  { stage: 5, title: "Chart Assignment", shortLabel: "Assign" },
  { stage: 6, title: "Active Overview", shortLabel: "Active" },
];

interface SetupStepperProps {
  currentStage: StageNumber;
  highestReachedStage: StageNumber;
  onSelectStage: (stage: StageNumber) => void;
  /** True when the merchant's own per-product size charts stood in for stages 2-5. Those stages are
   *  then neither reached nor pending — they do not apply to this store — so they are marked rather
   *  than left looking like work still owed. */
  sizingStagesSkipped?: boolean;
}

/**
 * The six-stage pipeline's top bar, ported from the demo's wide horizontal `Stepper.tsx` — full
 * width, numbered circles, an "AI" callout on the two agent-run stages, and arrow dividers — and
 * recolored to Persona's brand gradient instead of the demo's fixed purple/pink.
 */
export function SetupStepper({
  currentStage,
  highestReachedStage,
  onSelectStage,
  sizingStagesSkipped = false,
}: SetupStepperProps) {
  return (
    <div className="rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3 py-3 shadow-[var(--shadow-elevated)] backdrop-blur-xl sm:px-4">
      <nav aria-label="Setup pipeline progress">
        <ol className="flex items-center justify-between gap-1">
          {STEPS.map((step, index) => {
            const isSkipped = sizingStagesSkipped && step.stage >= 2 && step.stage <= 5;
            const isCompleted = currentStage > step.stage && !isSkipped;
            const isCurrent = currentStage === step.stage;
            // Still reachable when skipped: a merchant who wants to see what they skipped, or to run
            // it after all, has no other way in — unbinding the size chart column is the un-skip, and
            // it is on Stage 1.
            const isAccessible = step.stage <= highestReachedStage;

            return (
              <li key={step.stage} className="flex flex-1 items-center">
                <button
                  type="button"
                  disabled={!isAccessible}
                  onClick={() => isAccessible && onSelectStage(step.stage)}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-[var(--radius-lg)] p-1.5 text-left transition-all",
                    isAccessible ? "cursor-pointer hover:bg-[var(--color-surface-elevated)]" : "cursor-not-allowed opacity-50"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300",
                      isSkipped && !isCurrent && "border border-dashed border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]",
                      isCompleted && "gradient-brand text-white shadow-[var(--shadow-glow)]",
                      isCurrent && "gradient-brand text-white shadow-[var(--shadow-glow)] ring-3 ring-[var(--color-brand-light)]",
                      !isCompleted && !isCurrent && !isSkipped && "border border-[var(--color-border)] bg-[var(--color-surface-base)] text-[var(--color-text-muted)]"
                    )}
                  >
                    {isSkipped ? (
                      <FastForward className="h-3.5 w-3.5" />
                    ) : isCompleted ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      step.stage
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "truncate text-xs font-semibold",
                          isCurrent
                            ? "font-bold text-[var(--color-text-primary)]"
                            : isCompleted
                              ? "text-[var(--color-text-secondary)]"
                              : "text-[var(--color-text-muted)]"
                        )}
                      >
                        <span className="hidden xl:inline">{step.title}</span>
                        <span className="xl:hidden">{step.shortLabel}</span>
                      </span>
                      {step.aiPowered && (
                        <span className="hidden items-center gap-0.5 rounded bg-[var(--color-brand-light)] px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-[var(--color-brand)] lg:inline-flex">
                          <Sparkles className="h-2.5 w-2.5" /> AI
                        </span>
                      )}
                    </div>
                    <span className="hidden truncate text-[10px] text-[var(--color-text-muted)] md:block">
                      {isSkipped
                        ? "Skipped — your charts"
                        : isCompleted
                          ? "Completed"
                          : isCurrent
                            ? "Active stage"
                            : `Step ${step.stage}`}
                    </span>
                  </div>
                </button>

                {index < STEPS.length - 1 && (
                  <div className="hidden shrink-0 px-1 text-[var(--color-border-strong)] sm:flex">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
