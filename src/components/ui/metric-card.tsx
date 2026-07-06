import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  trend?: { value: number; label: string };
  accent?: "brand" | "wearable" | "unwearable" | "success";
  className?: string;
}

const ACCENT_DOT: Record<string, string> = {
  brand:      "gradient-brand",
  wearable:   "gradient-wearable",
  unwearable: "gradient-unwearable",
  success:    "bg-[var(--color-success)]",
};

export function MetricCard({ label, value, sub, icon, trend, accent = "brand", className }: MetricCardProps) {
  return (
    <div className={cn("card-interactive p-5 flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--color-text-muted)]">{label}</span>
        {icon && (
          <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center text-white text-sm shadow-sm", ACCENT_DOT[accent])}>
            {icon}
          </div>
        )}
      </div>
      <div>
        <div className="text-2xl font-display font-extrabold text-[var(--color-text-primary)] tracking-tight">{value}</div>
        {sub && <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{sub}</div>}
      </div>
      {trend && (
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "text-xs font-medium",
              trend.value >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-error)]"
            )}
          >
            {trend.value >= 0 ? "▲" : "▼"} {Math.abs(trend.value)}%
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">{trend.label}</span>
        </div>
      )}
    </div>
  );
}
