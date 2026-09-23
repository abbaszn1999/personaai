"use client";

import { cn } from "@/lib/utils/cn";
import { USAGE_TOOLS } from "@/lib/billing/usage-report";
import { RANGE_OPTIONS, TOOL_META } from "../constants";
import type { UsageFilters } from "../hooks/use-usage-filters";

const SELECT_CLASS =
  "h-8 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3 text-xs font-semibold text-[var(--color-text-primary)]";

interface FilterBarProps {
  filters: UsageFilters;
  generatedAt: string | null;
  onChange: (patch: Partial<UsageFilters>) => void;
}

export function FilterBar({ filters, generatedAt, onChange }: FilterBarProps) {
  return (
    <div className="card-base p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-base)] p-1">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() =>
                onChange({
                  range: option.id,
                  ...(option.id === "custom" ? {} : { from: "", to: "" }),
                })
              }
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200",
                filters.range === option.id
                  ? "gradient-brand text-white shadow-sm"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {filters.range === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filters.from}
              onChange={(event) => onChange({ from: event.target.value })}
              className={SELECT_CLASS}
              aria-label="Start date"
            />
            <span className="text-xs text-[var(--color-text-muted)]">to</span>
            <input
              type="date"
              value={filters.to}
              onChange={(event) => onChange({ to: event.target.value })}
              className={SELECT_CLASS}
              aria-label="End date"
            />
          </div>
        )}
        {generatedAt && (
          <span className="ml-auto text-xs text-[var(--color-text-muted)]">
            Updated {new Date(generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Source"
          className={SELECT_CLASS}
          value={filters.source}
          onChange={(event) => onChange({ source: event.target.value })}
        >
          <option value="all">All sources</option>
          <option value="store">Store</option>
          <option value="preview">Preview</option>
        </select>
        <select
          aria-label="Tool"
          className={SELECT_CLASS}
          value={filters.tool}
          onChange={(event) => onChange({ tool: event.target.value })}
        >
          <option value="all">All tools</option>
          {USAGE_TOOLS.map((tool) => (
            <option key={tool} value={tool}>
              {TOOL_META[tool].label}
            </option>
          ))}
        </select>
        <select
          aria-label="Group by"
          className={SELECT_CLASS}
          value={filters.bucket}
          onChange={(event) => onChange({ bucket: event.target.value })}
        >
          <option value="day">By day</option>
          <option value="week">By week</option>
        </select>
        <div className="flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-base)] p-1">
          {(["usd", "units"] as const).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => onChange({ view })}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-semibold",
                filters.view === view
                  ? "bg-[var(--color-surface-card)] text-[var(--color-text-primary)] shadow-sm"
                  : "text-[var(--color-text-muted)]"
              )}
            >
              {view === "usd" ? "Dollars" : "Units"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
