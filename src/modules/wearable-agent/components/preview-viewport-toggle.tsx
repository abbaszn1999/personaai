"use client";

import { Monitor, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type PreviewViewportMode = "desktop" | "mobile";

interface PreviewViewportToggleProps {
  value: PreviewViewportMode;
  onChange: (mode: PreviewViewportMode) => void;
}

export function PreviewViewportToggle({ value, onChange }: PreviewViewportToggleProps) {
  return (
    <div
      className="flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-base)] p-0.5"
      role="group"
      aria-label="Preview viewport"
    >
      {(
        [
          { id: "desktop" as const, label: "Desktop", icon: Monitor },
          { id: "mobile" as const, label: "Mobile", icon: Smartphone },
        ] as const
      ).map(({ id, label, icon: Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
              active
                ? "bg-[var(--color-surface-card)] text-[var(--color-text-primary)] shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
