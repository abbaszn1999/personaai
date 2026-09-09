import * as React from "react";
import { cn } from "@/lib/utils/cn";

const TONE_CLASSES: Record<string, string> = {
  brand:     "gradient-brand text-white",
  accent:    "gradient-accent text-white",
  wearable:  "gradient-wearable text-white",
  success:   "bg-[var(--color-success-light)] text-[var(--color-success)]",
  warning:   "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  info:      "bg-[var(--color-info-light)] text-[var(--color-info)]",
  neutral:   "bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)]",
};

interface StatTileProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  /** A short line under the number — a route, a hint, whatever earns its place. */
  note?: string;
  tone?: keyof typeof TONE_CLASSES;
  className?: string;
}

/**
 * The one small-metric tile used across every store tab — category counts, brand routing,
 * chart coverage, sync totals. Consolidated because five near-identical versions of this had
 * drifted into existence across the sizing stages; a shopper-facing dashboard reads as sloppy
 * the moment its own metric cards don't agree on padding or icon treatment.
 */
export function StatTile({ icon, label, value, note, tone = "brand", className }: StatTileProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-4",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            TONE_CLASSES[tone]
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
          <p className="text-xl font-bold leading-tight text-[var(--color-text-primary)]">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
        </div>
      </div>
      {note && <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">{note}</p>}
    </div>
  );
}
