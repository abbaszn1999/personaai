"use client";

import * as React from "react";
import Image from "next/image";
import { AlertTriangle, Check, PencilLine, Zap, ImageOff, Filter, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { useSizingStore } from "../store";
import type { GapItem } from "../types";
import { StageHeaderBanner } from "./stage-header-banner";

type GapStatusFilter = "all" | "complete" | "pending";

/**
 * Stage 5 — the stock no chart covers.
 *
 * Private labels have no public size guide and unbranded stock has nothing to search for, so this
 * is the one stage that cannot be automated away. Every grid arrives pre-filled with a plausible
 * baseline for its category rather than blank: a merchant correcting numbers finishes, a merchant
 * facing an empty table abandons setup. Laid out as the demo's filterable gap-fill table rather
 * than the earlier row list, so progress reads the same way it does in Stages 3-4.
 */
export function StageGapFilling({ items, onOpen }: { items?: GapItem[]; onOpen?: (item: GapItem) => void } = {}) {
  const storeGaps = useSizingStore((s) => s.gapItems);
  const openGapModal = useSizingStore((s) => s.openGapModal);
  const completeAllGaps = useSizingStore((s) => s.completeAllGaps);

  const [statusFilter, setStatusFilter] = React.useState<GapStatusFilter>("all");

  // The Sync tab passes its own delta gaps; Setup uses the pipeline's.
  const gaps = items ?? storeGaps;
  const open = onOpen ?? openGapModal;

  const remaining = gaps.filter((gap) => gap.status !== "complete");
  const affectedSkus = remaining.reduce((sum, gap) => sum + gap.skuCount, 0);
  const filledPct = gaps.length > 0 ? Math.round(((gaps.length - remaining.length) / gaps.length) * 100) : 100;

  const heading =
    remaining.length === 0
      ? "Every gap is filled"
      : `${remaining.length} gap${remaining.length === 1 ? "" : "s"} left to fill`;
  const subheading =
    remaining.length === 0
      ? "Nothing in your catalog is without a size chart."
      : `${affectedSkus.toLocaleString()} items have no chart behind them. Until these are filled, the fit filter has nothing to check them against.`;
  const acceptAll = remaining.length > 0 && !items && (
    <Button variant="secondary" size="sm" onClick={completeAllGaps}>
      <Zap className="h-3.5 w-3.5" /> Accept all suggested
    </Button>
  );

  const visibleGaps = gaps.filter((gap) => {
    if (statusFilter === "complete") return gap.status === "complete";
    if (statusFilter === "pending") return gap.status !== "complete";
    return true;
  });

  return (
    <div className="space-y-4">
      {/* The Sync tab reuses this component for its own delta gaps, where "Stage 5 of 6" framing
       *  would be wrong — only the real setup pipeline gets the banner. */}
      {items ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{heading}</h3>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{subheading}</p>
          </div>
          {acceptAll}
        </div>
      ) : (
        <StageHeaderBanner
          stageNumber={5}
          eyebrow="Manual Review"
          title={heading}
          description={subheading}
          actions={acceptAll}
        />
      )}

      {remaining.length > 0 && (
        <div className="flex items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-warning)]" />
          <p className="text-xs text-[var(--color-warning)]">
            Each grid is pre-filled with a typical range for its category. Check them against a
            garment you have on hand — a measured sample beats a generic table every time.
          </p>
        </div>
      )}

      {/* Progress bar + filter chips */}
      <div className="space-y-3 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4 shadow-[var(--shadow-card)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-elevated)]">
            <div
              className="h-full rounded-full gradient-brand transition-all"
              style={{ width: `${filledPct}%` }}
            />
          </div>
          <span className="shrink-0 text-xs font-bold text-[var(--color-text-primary)]">{filledPct}% filled</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--color-border)] pt-3">
          <span className="mr-1 flex items-center gap-1 text-xs font-semibold text-[var(--color-text-muted)]">
            <Filter className="h-3 w-3" /> Filter:
          </span>
          <GapFilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            All ({gaps.length})
          </GapFilterChip>
          <GapFilterChip active={statusFilter === "pending"} onClick={() => setStatusFilter("pending")} tone="warning">
            <AlertTriangle className="h-3 w-3" /> Needs action ({remaining.length})
          </GapFilterChip>
          <GapFilterChip active={statusFilter === "complete"} onClick={() => setStatusFilter("complete")} tone="success">
            <Check className="h-3 w-3" /> Filled ({gaps.length - remaining.length})
          </GapFilterChip>
        </div>
      </div>

      {/* Gap-fill table */}
      <div className="overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)] backdrop-blur-xl">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-6 py-4">
          <ListChecks className="h-4 w-4 text-[var(--color-brand)]" />
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
            Sizing matrices ({visibleGaps.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              <tr>
                <th className="px-6 py-3.5">Brand / group</th>
                <th className="px-6 py-3.5">Category path</th>
                <th className="px-6 py-3.5">Coverage</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {visibleGaps.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-xs text-[var(--color-text-muted)]">
                    Nothing matches that filter.
                  </td>
                </tr>
              ) : (
                visibleGaps.map((gap) => (
                  <GapTableRow key={gap.id} gap={gap} onOpen={() => open(gap)} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GapFilterChip({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone?: "success" | "warning";
  children: React.ReactNode;
}) {
  const activeClass =
    tone === "success"
      ? "bg-[var(--color-success-fill-strong)] text-[var(--color-success)] border-[var(--color-success-border)]"
      : tone === "warning"
        ? "bg-[var(--color-warning-fill-strong)] text-[var(--color-warning)] border-[var(--color-warning-border)]"
        : "bg-[var(--color-neutral-fill-strong)] text-[var(--color-text-primary)] border-[var(--color-border-strong)]";
  const idleClass =
    tone === "success"
      ? "bg-[var(--color-success-light)] text-[var(--color-success)] border-[var(--color-success)]/25 hover:border-[var(--color-success-border)]"
      : tone === "warning"
        ? "bg-[var(--color-warning-light)] text-[var(--color-warning)] border-[var(--color-warning)]/25 hover:border-[var(--color-warning-border)]"
        : "bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors",
        active ? activeClass : idleClass
      )}
    >
      {children}
    </button>
  );
}

function GapTableRow({ gap, onOpen }: { gap: GapItem; onOpen: () => void }) {
  const isComplete = gap.status === "complete";

  return (
    <tr
      className={cn(
        "transition-colors",
        isComplete ? "bg-[var(--color-success-light)]/20 hover:bg-[var(--color-success-light)]/40" : "hover:bg-[var(--color-warning-light)]/20"
      )}
    >
      <td className="px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {gap.sampleProducts.slice(0, 3).map((product) => (
              <GapThumb key={product.sku} src={product.imageUrl} alt={product.title} />
            ))}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate font-bold text-[var(--color-text-primary)]">{gap.title}</p>
              <Badge variant={gap.type === "brand" ? "warning" : "neutral"} className="text-[9px]">
                {gap.type === "brand" ? "Private label" : "Unbranded"}
              </Badge>
              {gap.isInheritedFromSetup && (
                <Badge variant="info" className="text-[9px]">
                  {gap.inheritedFromSetupLabel ?? "Reused from setup"}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </td>

      <td className="px-6 py-3.5">
        <span className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2.5 py-1 font-mono text-xs text-[var(--color-text-secondary)]">
          {gap.categoryPath}
        </span>
      </td>

      <td className="px-6 py-3.5 text-xs text-[var(--color-text-secondary)]">
        <span className="font-mono font-semibold">{gap.skuCount.toLocaleString()}</span> items ·{" "}
        {gap.rows.length} sizes · {gap.columns.length - 1} measurements
      </td>

      <td className="px-6 py-3.5">
        {isComplete ? (
          <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-2.5 py-1 text-xs font-bold text-[var(--color-success)]">
            <Check className="h-3.5 w-3.5" /> Filled
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] px-2.5 py-1 text-xs font-bold text-[var(--color-warning)]">
            <AlertTriangle className="h-3.5 w-3.5" /> Needs review
          </span>
        )}
      </td>

      <td className="px-6 py-3.5 text-right">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-1.5 text-xs font-bold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)]"
        >
          <PencilLine className="h-3.5 w-3.5" /> {isComplete ? "Review" : "Fill in"}
        </button>
      </td>
    </tr>
  );
}

function GapThumb({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = React.useState(false);

  return (
    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border-2 border-[var(--color-surface-card)] bg-[var(--color-surface-elevated)]">
      {failed ? (
        <div className="flex h-full w-full items-center justify-center">
          <ImageOff className="h-3 w-3 text-[var(--color-text-muted)]" />
        </div>
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="36px"
          className="object-cover"
          onError={() => setFailed(true)}
          unoptimized
        />
      )}
    </div>
  );
}
