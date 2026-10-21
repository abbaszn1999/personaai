"use client";

import * as React from "react";
import { AlertTriangle, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SetupStageFooterProps {
  /** Set while the merchant is being shown what leaving the stage early actually costs. */
  confirmingGaps: boolean;
  unresearchedBrands: number;
  gapSkus: number;
  /** Short status lines shown beside Continue, e.g. why it is disabled. */
  hints?: string[];
  continueDisabled?: boolean;
  backDisabled?: boolean;
  onBack: () => void;
  onContinue: () => void;
  /** "Stay here" on the gap confirmation. */
  onStay: () => void;
  /** "Continue anyway" on the gap confirmation. */
  onContinueAnyway: () => void;
}

/**
 * The sticky Back / Continue bar under the middle stages, including the confirmation shown when
 * Stage 4 is left with brands that still have no chart. Shared by the setup pipeline and the Sync
 * flow so the two cannot drift apart.
 */
export function SetupStageFooter({
  confirmingGaps,
  unresearchedBrands,
  gapSkus,
  hints = [],
  continueDisabled = false,
  backDisabled = false,
  onBack,
  onContinue,
  onStay,
  onContinueAnyway,
}: SetupStageFooterProps) {
  return (
    <div className="sticky bottom-4 z-10 space-y-3 rounded-[var(--radius-2xl)] border border-[var(--color-border-strong)] bg-[var(--color-surface-sticky)] p-3.5 shadow-[var(--shadow-modal)]">
      {confirmingGaps && (
        <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-warning-border)] bg-[var(--color-warning-light)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
            <div>
              <p className="text-sm font-bold text-[var(--color-text-primary)]">
                {unresearchedBrands} brand{unresearchedBrands === 1 ? "" : "s"} still {unresearchedBrands === 1 ? "has" : "have"} no
                complete chart
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                {gapSkus.toLocaleString()} item{gapSkus === 1 ? "" : "s"} will go through with no size chart behind them. You can
                generate or hand-fill those later, but they will not be sized until you do.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onStay}>
              Stay here
            </Button>
            <Button size="sm" onClick={onContinueAnyway}>
              Continue anyway <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} disabled={backDisabled}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>

        <div className="flex items-center gap-3">
          {hints.map((hint) => (
            <p key={hint} className="text-xs font-medium text-[var(--color-text-muted)]">
              {hint}
            </p>
          ))}
          <Button size="sm" onClick={onContinue} disabled={continueDisabled}>
            Continue <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
