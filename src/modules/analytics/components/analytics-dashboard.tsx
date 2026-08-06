"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import type { DateRange, WorkspaceAnalyticsPayload } from "../types";
import { KpiRow } from "./kpi-row";
import { SalesChart } from "./sales-chart";
import { ConversionFunnel } from "./conversion-funnel";
import { WorkspaceBreakdown } from "./workspace-breakdown";
import { TopProductsTable } from "./top-products-table";
import { TryOnInsights } from "./try-on-insights";
import { LiveTryOnInsights } from "./live-tryon-insights";
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
  const [payload, setPayload] = React.useState<WorkspaceAnalyticsPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const { workspaces } = useWorkspaceStore();

  // When a workspaceId is provided, scope to that workspace only. There's no account-wide
  // Persona summary endpoint (every number is scoped to one workspace's own widget activity —
  // see src/lib/db/analytics.ts), so the account-wide view falls back to the first workspace,
  // which is also all the "breakdown" below can ever show while there's only one workspace.
  const workspace = workspaceId ? workspaces.find((w) => w.id === workspaceId) : workspaces[0];
  const effectiveWorkspaceId = workspaceId ?? workspace?.id;
  const isWearable   = workspace ? workspace.mode === "wearable"   : workspaces.some((w) => w.mode === "wearable"   && w.status === "active");
  const isUnwearable = workspace ? workspace.mode === "unwearable" : workspaces.some((w) => w.mode === "unwearable" && w.status === "active");

  React.useEffect(() => {
    if (!effectiveWorkspaceId) {
      setPayload(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    void (async () => {
      try {
        const res = await fetch(`/api/workspaces/${effectiveWorkspaceId}/analytics/summary?range=${range}`);
        if (!active) return;
        if (res.ok) {
          const data: WorkspaceAnalyticsPayload = await res.json();
          setPayload(data);
        }
      } catch {
        // Non-fatal — components below render their own empty/zero state.
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [effectiveWorkspaceId, range]);

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
      <KpiRow payload={payload} loading={loading} />

      {/* Sales chart */}
      <SalesChart payload={payload} />

      {/* Funnel + Workspace breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ConversionFunnel payload={payload} />
        {/* Show breakdown only when not scoped to a single workspace */}
        {!workspaceId && <WorkspaceBreakdown workspace={workspace ?? null} payload={payload} />}
        {workspaceId && (
          <ShopperStats payload={payload} />
        )}
      </div>

      {/* Top products */}
      <TopProductsTable payload={payload} />

      {/* Agent-specific insights — conditional on workspace mode */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {isWearable   && <TryOnInsights payload={payload} />}
        {isWearable   && <LiveTryOnInsights payload={payload} />}
        {isUnwearable && <AssistantInsights payload={payload} />}
      </div>

      {/* Shopper stats — only shown in account-wide view (workspace view shows it in the grid above) */}
      {!workspaceId && <ShopperStats payload={payload} />}
    </div>
  );
}
