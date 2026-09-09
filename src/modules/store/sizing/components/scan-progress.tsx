"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ScanSearch, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { useSizingStore } from "../store";
import type { SizingRunStage } from "../server-types";

/**
 * The catalog scan and brand classification, reported from the server.
 *
 * Replaces the timer-driven `RunProgress` this stage used to render. The difference matters beyond
 * honesty: the scan pages a merchant's whole catalog and takes minutes on a large store, so an
 * animation that finished in four seconds told them work was done while it had barely started — and
 * a refresh restarted the animation while the real run carried on invisibly. Every number here comes
 * from the `sizing_runs` row, so closing the tab and coming back shows actual progress.
 */

interface Phase {
  stage: SizingRunStage;
  label: string;
  description: string;
}

const PHASES: Phase[] = [
  { stage: "scan", label: "Read catalog", description: "Brands, categories & size formats" },
  { stage: "classify", label: "Classify brands", description: "Global vs private label" },
];

export function ScanProgress() {
  const run = useSizingStore((s) => s.run);
  const summary = useSizingStore((s) => s.summary);
  const runLoading = useSizingStore((s) => s.runLoading);
  const runError = useSizingStore((s) => s.runError);
  const startingRun = useSizingStore((s) => s.startingRun);
  const mappingApproved = useSizingStore((s) => s.mappingApproved);
  const startRun = useSizingStore((s) => s.startRun);
  const goToStage = useSizingStore((s) => s.goToStage);

  if (runLoading && !run) {
    return (
      <div className="card-base flex items-center justify-center gap-2.5 p-12 text-sm text-[var(--color-text-muted)]">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Checking for a previous scan…
      </div>
    );
  }

  if (run?.status === "failed") {
    return (
      <div className="card-base space-y-4 p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-error-light)] text-[var(--color-error)]">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">The scan didn&apos;t finish</h3>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Nothing was saved, so your previous results are untouched. You can start it again.
            </p>
          </div>
        </div>

        {run.error && (
          <p className="rounded-[var(--radius-lg)] border border-[var(--color-error)]/25 bg-[var(--color-error-light)] p-3 font-mono text-[11px] leading-relaxed text-[var(--color-error)]">
            {run.error}
          </p>
        )}

        <Button size="sm" onClick={() => void startRun()} disabled={startingRun}>
          <RefreshCw className={cn("h-3.5 w-3.5", startingRun && "animate-spin")} /> Try again
        </Button>
      </div>
    );
  }

  // Nothing has ever been run for this store.
  if (!run) {
    return (
      <div className="card-base space-y-5 p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] gradient-brand text-white shadow-sm">
            <ScanSearch className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Read the catalog</h3>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              One pass over your products to work out which brands and categories you carry, and how you write your
              sizes. No size charts are researched yet, and nothing is charged for this step.
            </p>
          </div>
        </div>

        <ul className="space-y-1.5 text-xs text-[var(--color-text-secondary)]">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-success)]" />
            Only the categories you selected are read.
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-success)]" />
            Your products aren&apos;t copied anywhere — only brand, category and size totals are kept.
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-success)]" />
            Cost is per brand, not per product, so catalog size doesn&apos;t change the price.
          </li>
        </ul>

        {!mappingApproved ? (
          <div className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] p-3.5 text-xs text-[var(--color-warning)] sm:flex-row sm:items-center sm:justify-between">
            <p>
              Approve your field mapping first — the scan reads sizes through it, so scanning now would read the wrong
              column.
            </p>
            <Button variant="secondary" size="sm" onClick={() => goToStage(1)}>
              Go to mapping
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={() => void startRun()} disabled={startingRun}>
            {startingRun ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Start scan
          </Button>
        )}

        {runError && <p className="text-xs font-medium text-[var(--color-error)]">{runError}</p>}
      </div>
    );
  }

  const activeIndex = PHASES.findIndex((phase) => phase.stage === run.stage);
  const isQueued = run.status === "pending";

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-base overflow-hidden p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] gradient-brand text-white shadow-sm">
              <ScanSearch className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                {run.stage === "classify" ? "Classifying brands" : "Reading your catalog"}
              </h3>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {isQueued
                  ? "Queued — starting within a few seconds."
                  : run.stage === "classify"
                    ? "One decision per brand, not per product."
                    : "Paging your store one category at a time."}
              </p>
            </div>
          </div>

          <div className="text-right">
            {/* A count, not a percentage. The total isn't known until the walk ends — a product count
                from the store's own category totals double-counts anything in two collections — and
                inventing a denominator is what made the old progress bar lie. */}
            <span className="gradient-text-brand text-2xl font-bold tabular-nums">
              {run.productsScanned.toLocaleString()}
            </span>
            <p className="font-mono text-[11px] text-[var(--color-text-muted)]">products read</p>
          </div>
        </div>

        {/* Indeterminate on purpose: it shows that work is happening without claiming to know how
            much is left. */}
        <div className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-elevated)]">
          <div className={cn("h-full w-1/3 rounded-full gradient-brand", !isQueued && "animate-indeterminate")} />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {PHASES.map((phase, index) => {
            const isPast = index < activeIndex;
            const isCurrent = index === activeIndex;
            return (
              <div
                key={phase.stage}
                className={cn(
                  "rounded-[var(--radius-lg)] border p-2.5 text-center transition-all",
                  isPast && "border-[var(--color-success)]/40 bg-[var(--color-success-light)] text-[var(--color-success)]",
                  isCurrent && "border-[var(--color-brand)] bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]",
                  !isPast && !isCurrent && "border-[var(--color-border)] bg-[var(--color-surface-base)] text-[var(--color-text-muted)]"
                )}
              >
                <div className="flex items-center justify-center gap-1 text-[11px] font-semibold">
                  {isPast ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : isCurrent && !isQueued ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <span className="flex h-3 w-3 items-center justify-center rounded-full bg-[var(--color-border)] text-[9px]">
                      {index + 1}
                    </span>
                  )}
                  <span className="truncate">{phase.label}</span>
                </div>
                <p className="mt-0.5 truncate text-[10px] opacity-80">{phase.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Real findings, streamed in as the scan writes them. Far more useful than a synthetic log:
          a merchant recognising their own brands appearing is how they know it is reading the right
          store, and a wrong brand shows up here while it is still cheap to fix. */}
      {summary.brands.length > 0 && (
        <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
            <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">Found so far</span>
            <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
              {summary.brands.length} brands · {summary.chartsNeeded} charts
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 p-4">
            {summary.brands.slice(0, 24).map((brand) => (
              <span
                key={brand.brandKey}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-secondary)]"
              >
                {brand.name ?? "No brand"}{" "}
                <span className="font-mono text-[10px] text-[var(--color-text-muted)]">{brand.skuCount}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
