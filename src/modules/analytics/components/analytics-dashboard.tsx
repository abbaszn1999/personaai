"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import type { DateRange } from "../mocks/analytics-data";
import { KpiRow } from "./kpi-row";
import { SalesChart } from "./sales-chart";
import { ConversionFunnel } from "./conversion-funnel";
import { WorkspaceBreakdown } from "./workspace-breakdown";
import { TopProductsTable } from "./top-products-table";
import { TryOnInsights } from "./try-on-insights";
import { AssistantInsights } from "./assistant-insights";
import { ShopperStats } from "./shopper-stats";
import { useWorkspaceStore } from "@/modules/workspaces/store";

const DATE_RANGES: { label: string; value: DateRange }[] = [
  { label: "7 days",  value: "7d"  },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
];

interface AnalyticsDashboardProps {
  workspaceId?: string;
}

export function AnalyticsDashboard({ workspaceId }: AnalyticsDashboardProps) {
  const [range, setRange] = React.useState<DateRange>("30d");
  const { workspaces } = useWorkspaceStore();

  // When a workspaceId is provided, scope to that workspace only
  const workspace = workspaceId ? workspaces.find((w) => w.id === workspaceId) : null;
  const isWearable   = workspace ? workspace.mode === "wearable"   : workspaces.some((w) => w.mode === "wearable"   && w.status === "active");
  const isUnwearable = workspace ? workspace.mode === "unwearable" : workspaces.some((w) => w.mode === "unwearable" && w.status === "active");

  return (
    <div className="space-y-5">
      {/* Date range filter */}
      <div className="flex items-center gap-1 panel-glass rounded-[var(--radius-full)] p-1 w-fit">
        {DATE_RANGES.map((dr) => (
          <button
            key={dr.value}
            onClick={() => setRange(dr.value)}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200",
              range === dr.value
                ? "gradient-brand text-white shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            )}
          >
            {dr.label}
          </button>
        ))}
      </div>

      {/* KPI row */}
      <KpiRow range={range} />

      {/* Sales chart */}
      <SalesChart range={range} />

      {/* Funnel + Workspace breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ConversionFunnel range={range} />
        {/* Show breakdown only when not scoped to a single workspace */}
        {!workspaceId && <WorkspaceBreakdown />}
        {workspaceId && (
          <ShopperStats range={range} />
        )}
      </div>

      {/* Top products */}
      <TopProductsTable />

      {/* Agent-specific insights — conditional on workspace mode */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {isWearable   && <TryOnInsights />}
        {isUnwearable && <AssistantInsights />}
      </div>

      {/* Shopper stats — only shown in account-wide view (workspace view shows it in the grid above) */}
      {!workspaceId && <ShopperStats range={range} />}
    </div>
  );
}
