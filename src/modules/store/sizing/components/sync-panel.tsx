"use client";

import * as React from "react";
import Image from "next/image";
import {
  RefreshCw,
  History,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Search,
  PencilLine,
  Package,
  ImageOff,
  Code2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stepper, type StepperStep } from "@/components/ui/stepper";
import { RunProgress, type RunLogLine, type RunPhase } from "@/components/ui/run-progress";
import { StatTile } from "@/components/ui/stat-tile";
import { cn } from "@/lib/utils/cn";
import { useSizingStore } from "../store";
import { NEW_SYNC_PRODUCTS } from "../mocks/catalog";
import { NEW_SYNC_FOUND_SIZE_CHARTS } from "../mocks/charts";
import { NEW_SYNC_GAP_ITEMS } from "../mocks/gaps";
import { SYNC_HISTORY, SYNC_RESEARCH_TARGETS } from "../mocks/sync";
import type { GapItem, SizingProduct, SyncResearchTarget } from "../types";
import { ChartCard } from "./stage-chart-research";
import { StageGapFilling } from "./stage-gap-filling";
import { SizeChartModal } from "./size-chart-modal";
import { GapFillModal } from "./gap-fill-modal";
import { SyncHistoryModal } from "./sync-history-modal";

type BoardStage = 1 | 2 | 3;

const STEPS: StepperStep[] = [
  { id: "arrivals", label: "New items", description: "What changed since the last sync" },
  { id: "routing", label: "Charts", description: "Reused, researched, or needs you" },
  { id: "gaps", label: "Gaps", description: "Fill what nothing covers" },
];

const EXTRACTION_PHASES: RunPhase[] = [
  { id: "resolve", label: "Resolve", description: "Item to chart" },
  { id: "normalize", label: "Normalize", description: "Metric units" },
  { id: "write", label: "Write", description: "Size specs" },
  { id: "validate", label: "Validate", description: "Integrity check" },
];

const EXTRACTION_LOGS: RunLogLine[] = [
  { time: "0.2s", text: "Resolving 30 new items to their brand + category chart families...", phaseId: "resolve" },
  { time: "0.6s", text: "3 of 4 families answered straight from the registry — no research spend...", phaseId: "resolve" },
  { time: "1.1s", text: "Normalizing the newly researched Puma chart to cm...", phaseId: "normalize" },
  { time: "1.6s", text: "Writing per-item size specifications for the delta...", phaseId: "write" },
  { time: "2.1s", text: "Validating against the existing catalog schema...", phaseId: "validate" },
  { time: "2.5s", text: "Delta published: 30 items now carry sizing.", phaseId: "validate" },
];

/**
 * The Sync tab — everything that arrives after initial setup.
 *
 * Runs the same three decisions as Setup, on a much smaller set. What makes it a separate surface
 * is the reuse: a brand already in the registry resolves for free, so a healthy store's syncs
 * should trend towards costing nothing at all. The gate before publishing exists because a delta
 * with an unfilled gap would quietly ship stock the fit filter cannot judge.
 */
export function SyncPanel() {
  const [stage, setStage] = React.useState<BoardStage>(1);
  const [highestStage, setHighestStage] = React.useState<BoardStage>(1);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [published, setPublished] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);

  // Delta gaps are local rather than in the pipeline store: they belong to this sync run, not to
  // the merchant's one-time setup, and clearing one must not mark the setup gap resolved.
  const [gaps, setGaps] = React.useState<GapItem[]>(NEW_SYNC_GAP_ITEMS);
  const openGapModal = useSizingStore((s) => s.openGapModal);

  const unresolved = gaps.filter((gap) => gap.status !== "complete");
  const lastSync = SYNC_HISTORY[0];

  function goTo(next: BoardStage) {
    setStage(next);
    if (next > highestStage) setHighestStage(next);
  }

  function handleGapSaved(item: GapItem) {
    setGaps((current) => current.map((gap) => (gap.id === item.id ? item : gap)));
  }

  if (publishing) {
    return (
      <RunProgress
        title="Publishing the delta"
        subtitle="Writing size specifications for the newly arrived items"
        icon={<Code2 className="h-5 w-5" />}
        phases={EXTRACTION_PHASES}
        logs={EXTRACTION_LOGS}
        durationMs={3000}
        counter={{ total: NEW_SYNC_PRODUCTS.length * 7, noun: "items" }}
        logFileName="delta_sync.log"
        onComplete={() => {
          setPublishing(false);
          setPublished(true);
        }}
        onCancel={() => setPublishing(false)}
        cancelLabel="Back to gaps"
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">
            {NEW_SYNC_PRODUCTS.length * 7} items changed since your last sync
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            Last run {lastSync.relativeTime} · {lastSync.cachedBrandsCount} brands reused,{" "}
            {lastSync.newBrandsResearched} researched
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
            <History className="h-3.5 w-3.5" /> History
          </Button>
          <Button variant="secondary" size="sm" disabled={publishing}>
            <RefreshCw className="h-3.5 w-3.5" /> Check for changes
          </Button>
        </div>
      </div>

      {published ? (
        <PublishedSummary onRunAgain={() => {
          setPublished(false);
          setStage(1);
          setHighestStage(1);
          setGaps(NEW_SYNC_GAP_ITEMS);
        }} />
      ) : (
        <>
          <Stepper
            steps={STEPS}
            currentStep={stage - 1}
            highestReachedStep={highestStage - 1}
            onSelectStep={(index) => goTo((index + 1) as BoardStage)}
          />

          <div className="border-t border-[var(--color-border)] pt-5">
            {stage === 1 && <ArrivalsBoard products={NEW_SYNC_PRODUCTS} />}
            {stage === 2 && <RoutingBoard gaps={gaps} />}
            {stage === 3 && <StageGapFilling items={gaps} onOpen={openGapModal} />}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
            <Button variant="ghost" size="sm" onClick={() => goTo((stage - 1) as BoardStage)} disabled={stage === 1}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>

            <div className="flex items-center gap-2">
              {stage === 3 && unresolved.length > 0 && (
                <p className="text-xs text-[var(--color-warning)]">
                  {unresolved.length} gap{unresolved.length === 1 ? "" : "s"} still need filling
                </p>
              )}
              {stage < 3 ? (
                <Button size="sm" onClick={() => goTo((stage + 1) as BoardStage)}>
                  Continue <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button size="sm" disabled={unresolved.length > 0} onClick={() => setPublishing(true)}>
                  Publish delta <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      <SyncHistoryModal isOpen={historyOpen} onClose={() => setHistoryOpen(false)} />
      <SizeChartModal />
      <GapFillModal onSave={handleGapSaved} />
    </div>
  );
}

function ArrivalsBoard({ products }: { products: SizingProduct[] }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          New and changed items
        </h3>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
          Only these are processed. Everything already in your catalog keeps the sizing it has.
        </p>
      </div>

      <div className="space-y-2">
        {products.map((product) => (
          <ArrivalRow key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}

function ArrivalRow({ product }: { product: SizingProduct }) {
  const [failed, setFailed] = React.useState(false);

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-3">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-surface-elevated)]">
        {failed ? (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-4 w-4 text-[var(--color-text-muted)]" />
          </div>
        ) : (
          <Image
            src={product.imageUrl}
            alt={product.title}
            fill
            sizes="48px"
            className="object-cover"
            onError={() => setFailed(true)}
            unoptimized
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
          {product.title}
        </p>
        <p className="truncate font-mono text-[11px] text-[var(--color-text-muted)]">
          {product.sku} · {product.category} &gt; {product.subCategory} · {product.sizes.join(", ")}
        </p>
      </div>

      <Badge
        variant={
          product.brandType === "global"
            ? "success"
            : product.brandType === "private"
              ? "warning"
              : "neutral"
        }
        className="shrink-0"
      >
        {product.brand || "No brand"}
      </Badge>
    </div>
  );
}

function RoutingBoard({ gaps }: { gaps: GapItem[] }) {
  const openChartModal = useSizingStore((s) => s.openChartModal);
  const openGapModal = useSizingStore((s) => s.openGapModal);

  const cached = SYNC_RESEARCH_TARGETS.filter((t) => t.status === "cached");
  const researched = SYNC_RESEARCH_TARGETS.filter((t) => t.status === "researched");
  const needsFill = SYNC_RESEARCH_TARGETS.filter((t) => t.status === "needs_gap_fill");

  function openTarget(target: SyncResearchTarget) {
    if (target.chartId) {
      const chart = NEW_SYNC_FOUND_SIZE_CHARTS.find((c) => c.id === target.chartId);
      if (chart) openChartModal(chart);
      return;
    }
    if (target.gapId) {
      // From live state, not the fixture — a gap edited on stage 3 must reopen with the edits.
      const gap = gaps.find((g) => g.id === target.gapId);
      if (gap) openGapModal(gap);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Where each chart came from
        </h3>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
          {cached.length} of {SYNC_RESEARCH_TARGETS.length} brand groups answered straight from the
          registry — those cost nothing to resolve.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          icon={<Zap className="h-4 w-4" />}
          label="Reused"
          value={cached.length}
          note="Already in the registry"
          tone="success"
        />
        <StatTile
          icon={<Search className="h-4 w-4" />}
          label="Researched"
          value={researched.length}
          note="New brand, searched once"
          tone="info"
        />
        <StatTile
          icon={<PencilLine className="h-4 w-4" />}
          label="Needs you"
          value={needsFill.length}
          note="Nothing to search for"
          tone="warning"
        />
      </div>

      <div className="space-y-2">
        {SYNC_RESEARCH_TARGETS.map((target) => (
          <button
            key={target.id}
            onClick={() => openTarget(target)}
            className="flex w-full items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-3 text-left transition-colors hover:border-[var(--color-brand)]"
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                target.status === "cached" && "bg-[var(--color-success-light)] text-[var(--color-success)]",
                target.status === "researched" && "bg-[var(--color-info-light)] text-[var(--color-info)]",
                target.status === "needs_gap_fill" && "bg-[var(--color-warning-light)] text-[var(--color-warning)]"
              )}
            >
              {target.status === "cached" ? (
                <Zap className="h-4 w-4" />
              ) : target.status === "researched" ? (
                <Search className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                {target.brand} — {target.category}
              </p>
              <p className="truncate text-[11px] text-[var(--color-text-muted)]">
                {target.skuCount} item{target.skuCount === 1 ? "" : "s"} · {target.statusLabel} ·{" "}
                {target.source}
              </p>
            </div>

            {target.confidence > 0 && (
              <Badge variant="neutral" className="shrink-0">
                {target.confidence}%
              </Badge>
            )}
          </button>
        ))}
      </div>

      {NEW_SYNC_FOUND_SIZE_CHARTS.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {NEW_SYNC_FOUND_SIZE_CHARTS.map((chart) => (
            <ChartCard key={chart.id} chart={chart} onOpen={() => openChartModal(chart)} />
          ))}
        </div>
      )}
    </div>
  );
}

function PublishedSummary({ onRunAgain }: { onRunAgain: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-[var(--radius-xl)] border border-[var(--color-success)]/30 bg-[var(--color-success-light)] p-5">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-success)]" />
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Delta published
          </h3>
          <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
            Every newly arrived item now carries measurement ranges. Three of four brand groups came
            straight from the registry, so this sync cost one search.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-4">
        <Package className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
        <p className="text-xs text-[var(--color-text-muted)]">
          Persona checks for changes on its own schedule. This tab is here for when you want to push
          a drop through immediately rather than wait for the nightly run.
        </p>
      </div>

      <Button variant="secondary" size="sm" onClick={onRunAgain}>
        <RefreshCw className="h-3.5 w-3.5" /> Run another sync
      </Button>
    </div>
  );
}
