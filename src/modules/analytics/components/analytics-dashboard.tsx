"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { DateRange, WorkspaceAnalyticsPayload } from "../types";
import { KpiRow } from "./kpi-row";
import { RevenueKpiRow } from "./revenue-kpi-row";
import { SalesChart } from "./sales-chart";
import { ConversionFunnel } from "./conversion-funnel";
import { RevenueBreakdown } from "./revenue-breakdown";
import { TopSellingProducts } from "./top-selling-products";
import { TopProductsTable } from "./top-products-table";
import { TryOnInsights } from "./try-on-insights";
import { LiveTryOnInsights } from "./live-tryon-insights";
import { AssistantInsights } from "./assistant-insights";
import { ShopperStats } from "./shopper-stats";
import { OrderTrackingBanner } from "./order-tracking-banner";
import { AttributionNote } from "./attribution-note";
import { SectionTitle } from "./stat-card";
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
  const [result, setResult] = React.useState<{
    key: string;
    payload: WorkspaceAnalyticsPayload | null;
    error: string | null;
  } | null>(null);
  // Every account has at most one project, so the passed-in workspaceId (if any) and the
  // account's single project always resolve to the same thing — see src/lib/db/analytics.ts.
  const workspace = useWorkspaceStore((s) => s.workspace);
  const effectiveWorkspaceId = workspaceId ?? workspace?.id;
  const requestKey = effectiveWorkspaceId ? `${effectiveWorkspaceId}:${range}` : null;

  React.useEffect(() => {
    if (!effectiveWorkspaceId || !requestKey) return;
    let active = true;

    void (async () => {
      const failed = "Analytics couldn't load. Try again in a moment.";
      try {
        const res = await fetch(`/api/workspaces/${effectiveWorkspaceId}/analytics/summary?range=${range}`);
        const data = res.ok ? ((await res.json()) as WorkspaceAnalyticsPayload) : null;
        if (active) setResult({ key: requestKey, payload: data, error: data ? null : failed });
      } catch {
        if (active) setResult({ key: requestKey, payload: null, error: failed });
      }
    })();

    return () => {
      active = false;
    };
  }, [effectiveWorkspaceId, range, requestKey]);

  const loading = requestKey !== null && result?.key !== requestKey;
  const current = requestKey !== null && result ? result : null;
  const payload = current?.payload ?? null;
  const error = !loading ? (current?.error ?? null) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 panel-glass rounded-[var(--radius-full)] p-1 w-fit">
          {DATE_RANGES.map((dr) => (
            <button
              key={dr.value}
              type="button"
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
        {effectiveWorkspaceId && (
          <a
            href={`/api/workspaces/${effectiveWorkspaceId}/analytics/orders-export?range=${range}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3 text-xs font-semibold text-[var(--color-text-primary)]"
          >
            <Download className="h-3.5 w-3.5" />
            Export orders CSV
          </a>
        )}
      </div>

      {error && (
        <p className="rounded-[var(--radius-lg)] border border-[var(--color-error-solid)] px-4 py-3 text-sm text-[var(--color-error-solid)]">
          {error}
        </p>
      )}

      {payload && <OrderTrackingBanner status={payload.sales.orderTracking} />}

      <section className="space-y-4">
        <SectionTitle title="Revenue" description="Orders Persona drove and what they returned" />
        <RevenueKpiRow payload={payload} loading={loading} />
        <SalesChart payload={payload} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <RevenueBreakdown payload={payload} />
          <TopSellingProducts payload={payload} />
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle title="Engagement" description="What shoppers did inside the widget" />
        <KpiRow payload={payload} loading={loading} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ConversionFunnel payload={payload} />
          <ShopperStats payload={payload} />
        </div>
        <TopProductsTable payload={payload} />
      </section>

      <section className="space-y-4">
        <SectionTitle title="Features" description="Try-on, live camera and assistant activity" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <TryOnInsights payload={payload} />
          <LiveTryOnInsights payload={payload} />
          <AssistantInsights payload={payload} />
        </div>
      </section>

      <AttributionNote />
    </div>
  );
}
