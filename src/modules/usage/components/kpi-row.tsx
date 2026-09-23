"use client";

import type { ReactNode } from "react";
import { changePercent, costPerShopperNanos, formatUsdFromNanos, projectedCycleCostNanos } from "@/lib/billing/usage-report";
import type { BillingSummary } from "@/modules/billing/types";
import type { UsageReportPayload } from "../types";

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-[var(--color-text-muted)]">No prior period</span>;
  const rounded = Math.round(value);
  const word = rounded > 0 ? "Up" : rounded < 0 ? "Down" : "Flat";
  return (
    <span className="text-xs text-[var(--color-text-muted)]">
      {word} {Math.abs(rounded)}% vs previous period
    </span>
  );
}

function Card({ label, value, detail }: { label: string; value: string; detail: ReactNode }) {
  return (
    <div className="card-base p-5 flex flex-col gap-2">
      <span className="text-sm text-[var(--color-text-muted)]">{label}</span>
      <span className="text-2xl font-display font-extrabold text-[var(--color-text-primary)] tracking-tight">{value}</span>
      <div>{detail}</div>
    </div>
  );
}

interface KpiRowProps {
  report: UsageReportPayload | null;
  summary: BillingSummary | null;
  loading: boolean;
}

export function KpiRow({ report, summary, loading }: KpiRowProps) {
  const spend = report?.spendNanos ?? 0;
  const shoppers = report?.shopperCount ?? 0;
  const perShopper = costPerShopperNanos(spend, shoppers);
  const projected = summary
    ? projectedCycleCostNanos({
        sessionUnits: summary.sessions.projectedCycleTotal,
        garmentUnits: summary.images.projectedCycleTotal,
        liveMinutes: summary.liveTryOn.projectedCycleTotal,
      })
    : null;

  if (loading && !report) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="card-base h-28 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <Card label="Spend" value={formatUsdFromNanos(spend)} detail={<Delta value={report?.changePercent ?? null} />} />
      <Card
        label="Active shoppers"
        value={shoppers.toLocaleString()}
        detail={<Delta value={report ? changePercent(shoppers, report.previousShopperCount) : null} />}
      />
      <Card
        label="Cost per shopper"
        value={perShopper === null ? "—" : formatUsdFromNanos(perShopper)}
        detail={<span className="text-xs text-[var(--color-text-muted)]">Spend divided by shoppers in this filter</span>}
      />
      <Card
        label="Projected this cycle"
        value={projected === null ? "—" : formatUsdFromNanos(projected)}
        detail={<span className="text-xs text-[var(--color-text-muted)]">From the current cycle burn, across every tool</span>}
      />
    </div>
  );
}
