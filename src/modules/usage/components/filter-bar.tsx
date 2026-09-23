"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { USAGE_TOOLS } from "@/lib/billing/usage-report";
import { RANGE_OPTIONS, TOOL_META } from "../constants";
import type { UsageFilters } from "../hooks/use-usage-filters";

const FIELD_CLASS =
  "h-8 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3 text-xs font-semibold text-[var(--color-text-primary)]";

function FilterMenu({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (id: string) => void;
}) {
  const current = options.find((option) => option.id === value)?.label ?? label;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className={cn(FIELD_CLASS, "inline-flex items-center gap-1.5")}
      >
        {current}
        <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="dashboard-theme min-w-[11rem] !bg-[var(--color-sidebar-bg)] !text-[var(--color-text-secondary)]">
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <DropdownMenuItem
              key={option.id}
              onSelect={() => onChange(option.id)}
              className={selected ? "bg-[var(--color-brand-light)] text-[var(--color-text-primary)]" : undefined}
            >
              {option.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
              className={cn(FIELD_CLASS, "scheme-dark")}
              aria-label="Start date"
            />
            <span className="text-xs text-[var(--color-text-muted)]">to</span>
            <input
              type="date"
              value={filters.to}
              onChange={(event) => onChange({ to: event.target.value })}
              className={cn(FIELD_CLASS, "scheme-dark")}
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
        <FilterMenu
          label="Source"
          value={filters.source}
          options={[
            { id: "all", label: "All sources" },
            { id: "store", label: "Store" },
            { id: "preview", label: "Preview" },
          ]}
          onChange={(source) => onChange({ source })}
        />
        <FilterMenu
          label="Tool"
          value={filters.tool}
          options={[
            { id: "all", label: "All tools" },
            ...USAGE_TOOLS.map((tool) => ({ id: tool, label: TOOL_META[tool].label })),
          ]}
          onChange={(tool) => onChange({ tool })}
        />
        <FilterMenu
          label="Group by"
          value={filters.bucket}
          options={[
            { id: "day", label: "By day" },
            { id: "week", label: "By week" },
          ]}
          onChange={(bucket) => onChange({ bucket })}
        />
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
