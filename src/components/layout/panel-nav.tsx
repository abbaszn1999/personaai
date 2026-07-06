"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface PanelNavItem {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

interface PanelNavProps {
  title: string;
  items: PanelNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}

export function PanelNav({ title, items, activeId, onSelect, className }: PanelNavProps) {
  return (
    <nav className={cn("panel-glass overflow-hidden sticky top-6", className)}>
      <div className="px-3 py-3 border-b border-[var(--color-border)]">
        <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider px-2">
          {title}
        </p>
      </div>
      <ul className="p-2 space-y-0.5">
        {items.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={item.disabled}
                onClick={() => !item.disabled && onSelect(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-[var(--radius-lg)] px-3 py-2.5 text-left transition-all group",
                  active && !item.danger
                    ? "bg-[var(--color-brand-light)] text-[var(--color-brand)]"
                    : active && item.danger
                      ? "bg-[var(--color-error-light)] text-[var(--color-error)]"
                      : item.disabled
                        ? "opacity-40 cursor-not-allowed text-[var(--color-text-muted)]"
                        : item.danger
                          ? "text-[var(--color-error)] hover:bg-[var(--color-error-light)]"
                          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-base)] hover:text-[var(--color-text-primary)]"
                )}
              >
                <span
                  className={cn(
                    "shrink-0 flex items-center justify-center h-8 w-8 rounded-[var(--radius-md)] border transition-all",
                    active && !item.danger
                      ? "panel-icon-pill-active border-transparent"
                      : active && item.danger
                        ? "panel-icon-pill-danger"
                        : item.danger
                          ? "panel-icon-pill-danger opacity-80"
                          : "panel-icon-pill group-hover:border-[rgba(255,255,255,0.16)]"
                  )}
                >
                  {item.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-none">{item.label}</p>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 truncate">
                    {item.description}
                  </p>
                </div>
                {active && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
