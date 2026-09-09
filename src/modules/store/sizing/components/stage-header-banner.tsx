"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { StageNumber } from "../types";

interface StageHeaderBannerProps {
  stageNumber: StageNumber;
  /** e.g. "Autonomous Classification", "Manual Fields", "Live Preview". */
  eyebrow: string;
  title: string;
  description: string;
  /** Marks the stage as agent-run rather than a manual review/edit step. */
  aiPowered?: boolean;
  /** Stats pills or buttons anchored to the right, mirroring the demo's per-stage header actions. */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * The "Stage N of 6" banner every stage in the demo opens with — title, one-line framing, and an
 * optional action/stat area on the right. Centralized so all six stages read as one pipeline
 * instead of six components that each invented their own header.
 */
export function StageHeaderBanner({
  stageNumber,
  eyebrow,
  title,
  description,
  aiPowered,
  actions,
  className,
}: StageHeaderBannerProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-5 shadow-[var(--shadow-elevated)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              aiPowered
                ? "border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] text-[var(--color-brand)]"
                : "border-[var(--color-border)] bg-[var(--color-surface-base)] text-[var(--color-text-secondary)]"
            )}
          >
            {aiPowered && <Sparkles className="h-3 w-3" />}
            Stage {stageNumber} of 6
          </span>
          <span className="text-[var(--color-text-muted)]">·</span>
          <span className="text-xs font-medium text-[var(--color-text-muted)]">{eyebrow}</span>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-2xl">
          {title}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-text-secondary)]">{description}</p>
      </div>

      {actions && <div className="flex shrink-0 items-center gap-3 self-start sm:self-auto">{actions}</div>}
    </div>
  );
}
