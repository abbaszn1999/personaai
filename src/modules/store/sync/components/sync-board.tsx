"use client";

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SetupStepper, type StepMeta } from "@/modules/store/sizing/components/setup-stepper";
import { SetupStageFooter } from "@/modules/store/sizing/components/setup-stage-footer";
import { StageChartResearch } from "@/modules/store/sizing/components/stage-chart-research";
import { StageConfirmation } from "@/modules/store/sizing/components/stage-confirmation-acs";
import { SizeChartModal } from "@/modules/store/sizing/components/size-chart-modal";
import { ManualChartModal } from "@/modules/store/sizing/components/manual-chart-modal";
import type { StageNumber } from "@/modules/store/sizing/types";
import { DEMO_BRAND_ROWS, DEMO_CHART_TOTALS, DEMO_PRODUCTS } from "../demo/demo-sizing-data";
import { DemoSizingProvider, useDemoSizingTools } from "../demo/demo-sizing-provider";

type SyncStep = 1 | 2;

/**
 * The Sync flow's two steps are Setup's Size Chart Research (Stage 4) and Active Overview (Stage 5),
 * numbered 1–2 here because that is where the merchant is in this flow.
 */
const SYNC_STEPS: StepMeta[] = [
  { stage: 1, title: "Size Chart Research", shortLabel: "Charts", aiPowered: true },
  { stage: 2, title: "Active Overview", shortLabel: "Active" },
];

const SYNC_STEP_COUNT = SYNC_STEPS.length;
const stageLabel = (step: SyncStep) => `Sync Stage ${step} of ${SYNC_STEP_COUNT}`;

interface SyncBoardProps {
  /** Back to the Sync dashboard. */
  onExit: () => void;
  notify: (message: string) => void;
}

/**
 * The delta-sync board: the real Stage 4 and Stage 5 screens from Setup, running on demo data.
 *
 * Nothing here reads or writes the live sizing store — `DemoSizingProvider` swaps the state those
 * screens see for the demo batch in `../demo`. When Sync is wired up for real, this is the place to
 * swap the provider for the live store.
 */
export function SyncBoard({ onExit, notify }: SyncBoardProps) {
  const [step, setStep] = React.useState<SyncStep>(1);
  const [highestStep, setHighestStep] = React.useState<SyncStep>(1);

  const goTo = React.useCallback((next: SyncStep) => {
    setStep(next);
    setHighestStep((current) => (next > current ? next : current));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <DemoSizingProvider notify={notify} onPrevStage={() => goTo(1)}>
      <div className="space-y-4 pb-4">
        <SetupStepper
          steps={SYNC_STEPS}
          ariaLabel="Sync progress"
          currentStage={step as StageNumber}
          highestReachedStage={highestStep as StageNumber}
          onSelectStage={(stage) => goTo(stage as SyncStep)}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-warning-border)] bg-[var(--color-warning-light)] px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-warning-border)] px-2.5 py-0.5 font-bold text-[var(--color-warning)]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-warning)]" />
              Shopify Delta Ingestion
            </span>
            <span className="font-medium text-[var(--color-text-secondary)]">
              <strong className="text-[var(--color-text-primary)]">{DEMO_PRODUCTS.length} New SKUs</strong>
              {" · "}Auto-inherited Store Field Mappings
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={onExit}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Sync Dashboard
          </Button>
        </div>

        {step === 1 && <ResearchStep onBack={onExit} onContinue={() => goTo(2)} />}
        {step === 2 && <ActiveOverviewStep />}

        <SizeChartModal />
        <ManualChartModal />
      </div>
    </DemoSizingProvider>
  );
}

/** Step 1, with the same footer and "leaving with uncharted brands" confirmation as Setup's Stage 4. */
function ResearchStep({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  const [confirmingGaps, setConfirmingGaps] = React.useState(false);
  const unresearchedBrands = DEMO_BRAND_ROWS.filter((brand) => brand.status !== "done").length;

  return (
    <>
      <StageChartResearch stageLabel={stageLabel(1)} />
      <SetupStageFooter
        confirmingGaps={confirmingGaps}
        unresearchedBrands={unresearchedBrands}
        gapSkus={DEMO_CHART_TOTALS.gapSkus}
        onBack={onBack}
        onContinue={() => (unresearchedBrands > 0 ? setConfirmingGaps(true) : onContinue())}
        onStay={() => setConfirmingGaps(false)}
        onContinueAnyway={() => {
          setConfirmingGaps(false);
          onContinue();
        }}
      />
    </>
  );
}

function ActiveOverviewStep() {
  const { source, publisher, onOpenTester } = useDemoSizingTools();
  return (
    <StageConfirmation
      stageLabel={stageLabel(2)}
      source={source}
      publisher={publisher}
      cacheScope="sync-demo"
      onOpenTester={onOpenTester}
    />
  );
}
