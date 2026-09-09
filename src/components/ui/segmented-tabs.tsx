"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface SegmentedTabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  /** Rendered as a pill after the label. Zero still renders, so an emptied bucket stays visible. */
  count?: number;
  disabled?: boolean;
}

interface SegmentedTabsProps {
  items: SegmentedTabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}

/**
 * Horizontal tabs for switching views inside a panel. `PanelNav` is a left rail and doesn't fit
 * where a stage already owns the full width.
 */
export function SegmentedTabs({ items, activeId, onSelect, className }: SegmentedTabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex items-center gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-1",
        className
      )}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onSelect(item.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-xs font-medium transition-all",
              "disabled:cursor-not-allowed disabled:opacity-40",
              active
                ? "bg-[var(--color-surface-card)] text-[var(--color-text-primary)] shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            )}
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
            {item.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                  active
                    ? "bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]"
                    : "bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]"
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
