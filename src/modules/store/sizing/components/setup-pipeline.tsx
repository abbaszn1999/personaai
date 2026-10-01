"use client";

import * as React from "react";
import { AlertTriangle, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStoreConnectionStore } from "@/modules/store/store";
import { useSizingStore } from "../store";
import { SetupStepper } from "./setup-stepper";
import { StageFieldMapping } from "./stage-field-mapping";
import { StageItemPreview } from "./stage-item-preview";
import { StageBrandDiscovery } from "./stage-brand-discovery";
import { StageChartResearch } from "./stage-chart-research";
import { StageBrandMapping } from "./stage-brand-mapping";
import { StageConfirmation } from "./stage-confirmation-acs";
import { SizeChartModal } from "./size-chart-modal";
import { ManualChartModal } from "./manual-chart-modal";
import { LAST_STAGE } from "../types";
import { readStoredSizingStage, storeSizingStage } from "../stage-storage";

/**
 * The setup pipeline that turns a connected catalog into size intelligence.
 *
 * Navigation is a high-water mark rather than strictly linear: a merchant can jump back to review
 * a finished stage without redoing it, but cannot skip ahead of the furthest point they have
 * actually reached.
 *
 * Gap filling and leaf coverage both live in Stage 4. `covers_leaves` is the chart-assignment source
 * of truth, so the duplicate Chart Assignment screen is no longer part of the merchant flow and
 * Active Overview follows research directly as Stage 5.
 */
export function SetupPipeline() {
  const stage = useSizingStore((s) => s.stage);
  const highestStage = useSizingStore((s) => s.highestStage);
  const loadRun = useSizingStore((s) => s.loadRun);
  const goToStage = useSizingStore((s) => s.goToStage);
  const nextStage = useSizingStore((s) => s.nextStage);
  const prevStage = useSizingStore((s) => s.prevStage);
  const continueRun = useSizingStore((s) => s.continueRun);
  const startRun = useSizingStore((s) => s.startRun);
  const startingRun = useSizingStore((s) => s.startingRun);
  const chartBrands = useSizingStore((s) => s.chartBrands);
  const chartTotals = useSizingStore((s) => s.chartTotals);
  const run = useSizingStore((s) => s.run);
  const brandMappingStatus = useSizingStore((s) => s.brandMappingStatus);
  const brandMappingEditing = useSizingStore((s) => s.brandMappingEditing);
  const mappingApproved = useStoreConnectionStore((s) => s.acsMapping.approved);
  const connectionId = useStoreConnectionStore((s) => s.connection?.id ?? null);
  const mappingApproving = useStoreConnectionStore((s) => s.mapping.isApproving);
  const approveMapping = useStoreConnectionStore((s) => s.approveMapping);

  /** Set while the merchant is being shown what leaving stage 4 early actually costs. */
  const [confirmingGaps, setConfirmingGaps] = React.useState(false);
  const [restoredConnectionId, setRestoredConnectionId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!connectionId) return;
    let cancelled = false;
    const preferredStage = readStoredSizingStage(connectionId) ?? undefined;
    void loadRun({ restoreStage: true, preferredStage }).finally(() => {
      if (!cancelled) setRestoredConnectionId(connectionId);
    });
    return () => {
      cancelled = true;
    };
  }, [connectionId, loadRun]);

  React.useEffect(() => {
    if (restoredConnectionId === connectionId && connectionId) storeSizingStage(connectionId, stage);
  }, [connectionId, restoredConnectionId, stage]);

  const approveAndReadCatalog = React.useCallback(async () => {
    if (!mappingApproved && !(await approveMapping())) return;
    await startRun();
    nextStage();
  }, [mappingApproved, approveMapping, startRun, nextStage]);

  // A merchant coming back to review an approved mapping is navigating, not starting anything: the
  // run is already walking (or finished), and `startRun` would 409 on it.
  const leaveStageOne = React.useCallback(() => {
    if (mappingApproved && run !== null) nextStage();
    else void approveAndReadCatalog();
  }, [mappingApproved, run, nextStage, approveAndReadCatalog]);

  // Brands with no chart at all, and the stock they leave uncovered. Both numbers are named in the
  // confirmation rather than a vague warning: "12 brands, 3,410 items" is a decision a merchant can
  // make, "some products may be affected" is not.
  const unresearchedBrands = chartBrands.filter((brand) => brand.status !== "done").length;
  const gapSkus = chartTotals.gapSkus;

  // Stage 3 can't be left until the catalog has actually been read and its brands classified.
  // Everything past it is keyed on those results, so continuing early would show a brand queue that
  // is still empty or still unclassified — and read as a pipeline that ran fine.
  const scanIncomplete = run === null || run.stage === "scan" || run.stage === "classify";
  const blockedByScan = stage === 3 && scanIncomplete;
  const blockedByBrandMapping =
    stage === 4 && (brandMappingStatus !== "ready" || brandMappingEditing);

  // A scoped research pass writes charts from a background job. Leaving mid-pass would carry a
  // half-written chart set into Active Overview, where missing charts look like completed gaps.
  const researching = stage === 4 && run?.stage === "research" && (run.status === "pending" || run.status === "running");
  const stageOneActionPending = mappingApproving || startingRun;

  const advance = React.useCallback(() => {
    setConfirmingGaps(false);
    // Leaving Stage 4 records the parked `assign` run state server-side. That legacy internal name
    // now maps directly to Active Overview; there is no merchant-facing assignment stage.
    if (stage === 4) void continueRun();
    nextStage();
  }, [stage, continueRun, nextStage]);

  const handleContinue = React.useCallback(() => {
    // Proceeding with brands that have no chart is allowed — some brands genuinely publish nothing,
    // and holding a merchant on stage 4 over those would make the pipeline uncompletable. It is
    // confirmed rather than silent, because the consequence (that stock publishing with no size
    // chart) is invisible from anywhere else.
    if (stage === 4 && !blockedByBrandMapping && unresearchedBrands > 0) {
      setConfirmingGaps(true);
      return;
    }
    advance();
  }, [stage, blockedByBrandMapping, unresearchedBrands, advance]);

  if (restoredConnectionId !== connectionId) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center text-sm font-semibold text-slate-500 shadow-sm">
        Restoring your setup progress…
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <SetupStepper
        currentStage={stage}
        highestReachedStage={highestStage}
        onSelectStage={goToStage}
      />

      <div>
        {stage === 1 && (
          <StageFieldMapping
            onApproveAndContinue={leaveStageOne}
            actionPending={stageOneActionPending}
            actionLabel={
              mappingApproving
                ? "Approving mapping…"
                : startingRun
                  ? "Starting catalog read…"
                  : mappingApproved && run !== null
                    ? "Continue (Step 2)"
                    : "Confirm mapping & read catalog"
            }
          />
        )}
        {stage === 2 && <StageItemPreview />}
        {stage === 3 && <StageBrandDiscovery />}
        {stage === 4 && (blockedByBrandMapping ? <StageBrandMapping /> : <StageChartResearch />)}
        {stage === 5 && <StageConfirmation />}
      </div>

      {/* Stage 1 owns its Approve/Continue and Reset actions, so a second Continue underneath would
          be two buttons for one decision. Every other stage still uses this footer. */}
      {stage > 1 && stage < LAST_STAGE && (
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
                <Button variant="ghost" size="sm" onClick={() => setConfirmingGaps(false)}>
                  Stay here
                </Button>
                <Button size="sm" onClick={advance}>
                  Continue anyway <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={prevStage} disabled={stage === 1}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>

            <div className="flex items-center gap-3">
              {blockedByScan && (
                <p className="text-xs font-medium text-[var(--color-text-muted)]">
                  {run === null ? "Run the catalog scan first" : "Waiting for the scan to finish"}
                </p>
              )}
              {researching && (
                <p className="text-xs font-medium text-[var(--color-text-muted)]">
                  Waiting for the brand being researched to finish
                </p>
              )}
              {blockedByBrandMapping && (
                <p className="text-xs font-medium text-[var(--color-text-muted)]">
                  Save the canonical brand mapping to continue
                </p>
              )}
              <Button
                size="sm"
                onClick={handleContinue}
                disabled={blockedByScan || blockedByBrandMapping || researching}
              >
                Continue <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <SizeChartModal />
      <ManualChartModal />
    </div>
  );
}
