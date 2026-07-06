import * as React from "react";
import { cn } from "@/lib/utils/cn";

type PillVariant = "active" | "draft" | "paused" | "connected" | "disconnected" | "pending" | "error";

const PILL_STYLES: Record<PillVariant, string> = {
  active:       "bg-[var(--color-success-light)] text-[var(--color-success)]",
  connected:    "bg-[var(--color-success-light)] text-[var(--color-success)]",
  draft:        "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  pending:      "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  paused:       "bg-[var(--color-surface-base)] text-[var(--color-text-muted)] border border-[var(--color-border)]",
  disconnected: "bg-[var(--color-surface-base)] text-[var(--color-text-muted)] border border-[var(--color-border)]",
  error:        "bg-[var(--color-error-light)] text-[var(--color-error)]",
};

const DOT_ANIMATED: PillVariant[] = ["active", "connected", "pending"];

interface StatusPillProps {
  status: PillVariant;
  label?: string;
  className?: string;
}

export function StatusPill({ status, label, className }: StatusPillProps) {
  const text = label ?? status.charAt(0).toUpperCase() + status.slice(1);
  const animated = DOT_ANIMATED.includes(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1",
        PILL_STYLES[status],
        className
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-current",
          animated && "animate-pulse-dot"
        )}
      />
      {text}
    </span>
  );
}
