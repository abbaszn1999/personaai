"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSizingStore } from "../store";
import { SetupStepper } from "./setup-stepper";
import { StageFieldMapping } from "./stage-field-mapping";
import { StageItemPreview } from "./stage-item-preview";
import { StageBrandDiscovery } from "./stage-brand-discovery";
import { StageChartResearch } from "./stage-chart-research";
import { StageConfirmation } from "./stage-confirmation";
import { SizeChartModal } from "./size-chart-modal";
import { ManualChartModal } from "./manual-chart-modal";
import { LAST_STAGE } from "../types";

/**
 * The setup pipeline that turns a connected catalog into size intelligence.
 *
 * Navigation is a high-water mark rather than strictly linear: a merchant can jump back to review
 * a finished stage without redoing it, but cannot skip ahead of the furthest point they have
 * actually reached.
 *
 * Gap filling used to be stage 5. Doc Part 4 moved it into Stage 4 as a modal, which removed a step
 * every merchant walked through even with nothing to fill and put the gap list on the same screen
 * as the research results that define it. Phase 5's Chart Assignment takes the vacated slot.
 */
export function SetupPipeline() {
  const stage = useSizingStore((s) => s.stage);
  const highestStage = useSizingStore((s) => s.highestStage);
  const goToStage = useSizingStore((s) => s.goToStage);
  const nextStage = useSizingStore((s) => s.nextStage);
  const prevStage = useSizingStore((s) => s.prevStage);
  const resetPipeline = useSizingStore((s) => s.resetPipeline);
  const continueRun = useSizingStore((s) => s.continueRun);
  const gapItems = useSizingStore((s) => s.gapItems);
  const run = useSizingStore((s) => s.run);

  // Leaving stage 3 is what unblocks the research stage server-side — the merchant has just seen the
  // real brand/routing split and is choosing to spend on web search for it. Stage 4 then reads the
  // charts that pass writes, so this click is the only thing standing between the two.
  const handleContinue = React.useCallback(() => {
    if (stage === 3) void continueRun();
    nextStage();
  }, [stage, continueRun, nextStage]);

  // Every gap has to be resolved before sizing can be published — an unfilled brand+category means
  // that stock has no chart at all, and the fit filter would silently drop all of it.
  const unresolvedGaps = gapItems.filter((gap) => gap.status !== "complete").length;
  const blockedByGaps = stage === 5 && unresolvedGaps > 0;

  // Stage 3 can't be left until the catalog has actually been read and its brands classified.
  // Everything past it is keyed on those results, so continuing early would research charts against
  // a brand list that is still empty or still unclassified — and read as a pipeline that ran fine.
  const scanIncomplete = run === null || run.stage === "scan" || run.stage === "classify";
  const blockedByScan = stage === 3 && scanIncomplete;

  // Same rule one stage later: research writes charts from a background job, and the gap list on
  // stage 5 is defined as whatever research could not chart. Continuing mid-pass would present a
  // half-written set of gaps as the final one.
  const researching = stage === 4 && run?.stage === "research" && (run.status === "pending" || run.status === "running");

  return (
    <div className="space-y-4 pb-4">
      <SetupStepper
        currentStage={stage}
        highestReachedStage={highestStage}
        onSelectStage={goToStage}
      />

      <div>
        {stage === 1 && <StageFieldMapping />}
        {stage === 2 && <StageItemPreview />}
        {stage === 3 && <StageBrandDiscovery />}
        {stage === 4 && <StageChartResearch />}
        {stage === 5 && <StageConfirmation />}
      </div>

      {stage < LAST_STAGE && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-[var(--radius-2xl)] border border-[var(--color-border-strong)] bg-[var(--color-surface-sticky)] p-3.5 shadow-[var(--shadow-modal)]">
          <Button variant="ghost" size="sm" onClick={prevStage} disabled={stage === 1}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>

          <div className="flex items-center gap-3">
            {blockedByGaps && (
              <p className="text-xs font-medium text-[var(--color-warning)]">
                {unresolvedGaps} gap{unresolvedGaps === 1 ? "" : "s"} still need filling
              </p>
            )}
            {blockedByScan && (
              <p className="text-xs font-medium text-[var(--color-text-muted)]">
                {run === null ? "Run the catalog scan first" : "Waiting for the scan to finish"}
              </p>
            )}
            {researching && (
              <p className="text-xs font-medium text-[var(--color-text-muted)]">Waiting for chart research to finish</p>
            )}
            <Button size="sm" onClick={handleContinue} disabled={blockedByGaps || blockedByScan || researching}>
              Continue <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {stage === LAST_STAGE && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-[var(--radius-2xl)] border border-[var(--color-border-strong)] bg-[var(--color-surface-sticky)] p-3.5 shadow-[var(--shadow-modal)]">
          <Button variant="ghost" size="sm" onClick={prevStage}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
          <Button variant="secondary" size="sm" onClick={resetPipeline}>
            <RotateCcw className="h-3.5 w-3.5" /> Run setup again
          </Button>
        </div>
      )}

      <SizeChartModal />
      <ManualChartModal />
    </div>
  );
}
