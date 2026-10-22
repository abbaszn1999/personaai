"use client";

import * as React from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SetupStepper, type StepMeta } from "@/modules/store/sizing/components/setup-stepper";
import { SetupStageFooter } from "@/modules/store/sizing/components/setup-stage-footer";
import { StageChartResearch } from "@/modules/store/sizing/components/stage-chart-research";
import { StageBrandMapping } from "@/modules/store/sizing/components/stage-brand-mapping";
import { StageConfirmation } from "@/modules/store/sizing/components/stage-confirmation-acs";
import { SizeChartModal } from "@/modules/store/sizing/components/size-chart-modal";
import { ManualChartModal } from "@/modules/store/sizing/components/manual-chart-modal";
import { isRunWorking, type SizingRun } from "@/modules/store/sizing/server-types";
import type { StageNumber } from "@/modules/store/sizing/types";
import { useStoreConnectionStore } from "@/modules/store/store";
import { SYNC_CANCELLED_MESSAGE } from "@/lib/sync/constants";
import { LiveSyncProvider, useLiveSync, useLiveSyncSource } from "../live-sync-provider";
import { syncApi } from "../sync-api";

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

const PLATFORM_LABELS: Record<string, string> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  wordpress: "WordPress",
  custom: "Store",
};

interface SyncBoardProps {
  /** Back to the Sync dashboard. */
  onExit: () => void;
  notify: (message: string) => void;
}

/**
 * A sync of new products: Setup's Stage 4 and Stage 5 screens, run on the sync's products only.
 *
 * `LiveSyncProvider` points those screens at `/api/store-connection/sync/*`, which answer Setup's
 * questions over the products this sync took. Before the screens, the board shows the sync reading
 * its products and classifying their brands; after publishing, what it wrote.
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
    <LiveSyncProvider onPrevStage={() => goTo(1)}>
      <SyncBoardBody step={step} highestStep={highestStep} goTo={goTo} onExit={onExit} notify={notify} />
    </LiveSyncProvider>
  );
}

function SyncBoardBody({
  step,
  highestStep,
  goTo,
  onExit,
  notify,
}: {
  step: SyncStep;
  highestStep: SyncStep;
  goTo: (step: SyncStep) => void;
  onExit: () => void;
  notify: (message: string) => void;
}) {
  const run = useLiveSync((s) => s.run);
  const runLoaded = useLiveSync((s) => s.runLoaded);
  const runReadError = useLiveSync((s) => s.runReadError);
  const loadRun = useLiveSync((s) => s.loadRun);
  const stopPolling = useLiveSync((s) => s.stopPolling);
  const brandMapping = useLiveSync((s) => s.brandMapping);
  const loadBrandMapping = useLiveSync((s) => s.loadBrandMapping);

  React.useEffect(() => {
    void loadRun();
    return () => stopPolling();
  }, [loadRun, stopPolling]);

  // A sync reopened after its charts were reviewed lands on step 2, where it was left.
  const restoredRunId = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!run || restoredRunId.current === run.id) return;
    restoredRunId.current = run.id;
    if (run.stage === "assign" || run.stage === "publish") goTo(2);
  }, [run, goTo]);

  const reading = run !== null && isRunWorking(run) && (run.stage === "scan" || run.stage === "classify");
  const reviewing = run !== null && !reading && (run.status === "blocked" || isRunWorking(run));

  React.useEffect(() => {
    if (reviewing && brandMapping === null) void loadBrandMapping();
  }, [reviewing, brandMapping, loadBrandMapping]);

  let body: React.ReactNode;
  if (!runLoaded) body = <BoardMessage busy title="Opening the sync…" />;
  else if (!run) body = <BoardMessage title={runReadError ?? "There is no sync in progress."} />;
  else if (reading) body = <ReadingProgress run={run} />;
  else if (run.status === "complete") body = <SyncComplete onExit={onExit} />;
  else if (run.status === "failed") body = <SyncStopped run={run} onExit={onExit} notify={notify} />;
  else {
    body = (
      <>
        <SetupStepper
          steps={SYNC_STEPS}
          ariaLabel="Sync progress"
          currentStage={step as StageNumber}
          highestReachedStage={highestStep as StageNumber}
          onSelectStage={(stage) => goTo(stage as SyncStep)}
        />
        {step === 1 && <ResearchStep onBack={onExit} onContinue={() => goTo(2)} notify={notify} />}
        {step === 2 && <ActiveOverviewStep />}
        <SizeChartModal />
        <ManualChartModal />
      </>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <SyncInfoStrip onExit={onExit} notify={notify} />
      {body}
    </div>
  );
}

function SyncInfoStrip({ onExit, notify }: { onExit: () => void; notify: (message: string) => void }) {
  const platform = useStoreConnectionStore((s) => s.connection?.platform ?? "custom");
  const run = useLiveSync((s) => s.run);
  const products = useLiveSync((s) => s.runProducts);
  const loadRun = useLiveSync((s) => s.loadRun);
  const [confirmingCancel, setConfirmingCancel] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);

  const cancellable = run?.status === "blocked";
  const cancel = async () => {
    setCancelling(true);
    try {
      await syncApi.cancel();
      notify("Sync cancelled. Its products are back in the queue.");
      onExit();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not cancel the sync.");
      void loadRun();
    } finally {
      setCancelling(false);
      setConfirmingCancel(false);
    }
  };

  const newBrands = products?.newBrands.length ?? 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-warning-border)] bg-[var(--color-warning-light)] px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-warning-border)] px-2.5 py-0.5 font-bold text-[var(--color-warning)]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-warning)]" />
          {PLATFORM_LABELS[platform] ?? "Store"} Delta Ingestion
        </span>
        <span className="font-medium text-[var(--color-text-secondary)]">
          {products && (
            <>
              <strong className="text-[var(--color-text-primary)]">
                {products.total.toLocaleString()} New SKU{products.total === 1 ? "" : "s"}
              </strong>
              {newBrands > 0 && ` · ${newBrands} new brand${newBrands === 1 ? "" : "s"}`}
              {" · "}
            </>
          )}
          Auto-inherited Store Field Mappings
        </span>
      </div>
      <div className="flex items-center gap-1">
        {cancellable && !confirmingCancel && (
          <Button variant="ghost" size="sm" onClick={() => setConfirmingCancel(true)}>
            <X className="h-3.5 w-3.5" /> Cancel sync
          </Button>
        )}
        {cancellable && confirmingCancel && (
          <>
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              Put these products back in the queue?
            </span>
            <Button variant="ghost" size="sm" onClick={() => setConfirmingCancel(false)} disabled={cancelling}>
              Keep syncing
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void cancel()} disabled={cancelling}>
              {cancelling && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Cancel sync
            </Button>
          </>
        )}
        <Button variant="ghost" size="sm" onClick={onExit}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Sync Dashboard
        </Button>
      </div>
    </div>
  );
}

function BoardMessage({ title, busy = false }: { title: string; busy?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-10 text-sm text-[var(--color-text-muted)]">
      {busy && <Loader2 className="h-4 w-4 animate-spin" />} {title}
    </div>
  );
}

function ReadingProgress({ run }: { run: SizingRun }) {
  const products = useLiveSync((s) => s.runProducts);
  const title = run.stage === "scan" ? "Reading the new products from your store…" : "Classifying the new brands…";
  const detail = run.stage === "scan"
    ? `${(products?.total ?? 0).toLocaleString()} product${products?.total === 1 ? "" : "s"} in this sync. Your field mapping, Persona map and size settings from Setup are applied to each.`
    : "Only brands this store has never had are classified as global, private or unbranded. Every other brand keeps its Setup classification.";
  return (
    <div className="space-y-2 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-8 text-center">
      <Loader2 className="mx-auto h-6 w-6 animate-spin text-[var(--color-brand)]" />
      <p className="text-sm font-bold text-[var(--color-text-primary)]">{title}</p>
      <p className="mx-auto max-w-xl text-xs text-[var(--color-text-secondary)]">{detail}</p>
    </div>
  );
}

function SyncComplete({ onExit }: { onExit: () => void }) {
  const run = useLiveSync((s) => s.run);
  const products = useLiveSync((s) => s.runProducts);
  const published = products?.published ?? 0;
  return (
    <div className="space-y-3 rounded-[var(--radius-2xl)] border border-[var(--color-success-border)] bg-[var(--color-success-light)] p-8 text-center">
      <CheckCircle2 className="mx-auto h-7 w-7 text-[var(--color-success)]" />
      <p className="text-base font-bold text-[var(--color-text-primary)]">
        {published.toLocaleString()} new product{published === 1 ? "" : "s"} synced to your catalog
      </p>
      <p className="mx-auto max-w-xl text-xs text-[var(--color-text-secondary)]">
        Published {run?.publishedAt ? new Date(run.publishedAt).toLocaleString() : ""} alongside the catalog from Setup. Nothing
        else in your catalog was rewritten.
      </p>
      <Button size="sm" onClick={onExit}>
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Sync Dashboard
      </Button>
    </div>
  );
}

function SyncStopped({ run, onExit, notify }: { run: SizingRun; onExit: () => void; notify: (message: string) => void }) {
  const loadRun = useLiveSync((s) => s.loadRun);
  const [working, setWorking] = React.useState<"retry" | "cancel" | null>(null);
  const cancelled = run.error === SYNC_CANCELLED_MESSAGE;

  const act = async (action: "retry" | "cancel") => {
    setWorking(action);
    try {
      if (action === "retry") {
        await syncApi.retry();
        await loadRun();
      } else {
        await syncApi.cancel();
        notify("Sync cancelled. Its products are back in the queue.");
        onExit();
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not reach the server.");
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="space-y-3 rounded-[var(--radius-2xl)] border border-[var(--color-error-border)] bg-[var(--color-error-light)] p-6">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-error)]" />
        <div>
          <p className="text-sm font-bold text-[var(--color-text-primary)]">
            {cancelled ? "This sync was cancelled" : "This sync stopped before it finished"}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
            {cancelled
              ? "Its products went back to the queue and sync with the next run."
              : `${run.error ?? "Something went wrong."} Retrying continues from where it stopped; cancelling puts its products back in the queue.`}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        {!cancelled && (
          <>
            <Button size="sm" onClick={() => void act("retry")} disabled={working !== null}>
              {working === "retry" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Retry
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void act("cancel")} disabled={working !== null}>
              {working === "cancel" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Cancel sync
            </Button>
          </>
        )}
        <Button variant="ghost" size="sm" onClick={onExit}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Sync Dashboard
        </Button>
      </div>
    </div>
  );
}

/**
 * Step 1, with the same footer and "leaving with uncharted brands" confirmation as Setup's Stage 4.
 * The sync's new brands are mapped first, exactly as Setup maps the store's brands before its charts.
 */
function ResearchStep({
  onBack,
  onContinue,
  notify,
}: {
  onBack: () => void;
  onContinue: () => void;
  notify: (message: string) => void;
}) {
  const brandMappingStatus = useLiveSync((s) => s.brandMappingStatus);
  const brandMappingEditing = useLiveSync((s) => s.brandMappingEditing);
  const chartBrands = useLiveSync((s) => s.chartBrands);
  const chartTotals = useLiveSync((s) => s.chartTotals);
  const loadRun = useLiveSync((s) => s.loadRun);
  const [confirmingGaps, setConfirmingGaps] = React.useState(false);
  const [advancing, setAdvancing] = React.useState(false);

  const blockedByBrandMapping = brandMappingStatus !== "ready" || brandMappingEditing;
  const unresearchedBrands = chartBrands.filter((brand) => brand.status !== "done").length;

  const advance = async () => {
    setConfirmingGaps(false);
    setAdvancing(true);
    try {
      await syncApi.continueRun();
      await loadRun();
      onContinue();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not continue the sync.");
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <>
      {blockedByBrandMapping ? <StageBrandMapping /> : <StageChartResearch stageLabel={stageLabel(1)} />}
      <SetupStageFooter
        confirmingGaps={confirmingGaps}
        unresearchedBrands={unresearchedBrands}
        gapSkus={chartTotals.gapSkus}
        hints={blockedByBrandMapping ? ["Map the new brands first"] : []}
        continueDisabled={blockedByBrandMapping || advancing}
        onBack={onBack}
        onContinue={() => (unresearchedBrands > 0 ? setConfirmingGaps(true) : void advance())}
        onStay={() => setConfirmingGaps(false)}
        onContinueAnyway={() => void advance()}
      />
    </>
  );
}

function ActiveOverviewStep() {
  const { source, publisher } = useLiveSyncSource();
  const run = useLiveSync((s) => s.run);
  return (
    <StageConfirmation
      stageLabel={stageLabel(2)}
      source={source}
      publisher={publisher}
      cacheScope={`sync:${run?.id ?? "none"}`}
    />
  );
}
