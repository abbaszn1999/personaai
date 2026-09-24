"use client";

import { Download, Gauge } from "lucide-react";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { EmptyState } from "@/components/ui/empty-state";
import { BillingProvider, useBilling } from "@/modules/billing/hooks/use-billing";
import { useWorkspaceStore } from "@/modules/workspaces/store";
import { useUsageFilters } from "../hooks/use-usage-filters";
import { useUsageReport } from "../hooks/use-usage-report";
import { AccountStrip, WalletMeters } from "./wallet-meters";
import { FilterBar } from "./filter-bar";
import { KpiRow } from "./kpi-row";
import { ShopperDrawer } from "./shopper-drawer";
import { ShoppersTable } from "./shoppers-table";
import { SpendTrendChart } from "./spend-trend-chart";
import { ToolBreakdownTable } from "./tool-breakdown-table";

export function UsagePage() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const hasLoaded = useWorkspaceStore((state) => state.hasLoaded);
  if (!hasLoaded) {
    return <DashboardPageHeader title="Usage" description="Spend, shoppers, and cost by tool" />;
  }
  if (!workspace) {
    return (
      <>
        <DashboardPageHeader title="Usage" description="Spend, shoppers, and cost by tool" />
        <div className="p-6">
          <EmptyState
            icon={<Gauge className="h-6 w-6" />}
            title="No project yet"
            description="Create a project to start tracking real usage."
          />
        </div>
      </>
    );
  }
  return (
    <BillingProvider workspaceId={workspace.id}>
      <UsagePageContent />
    </BillingProvider>
  );
}

function UsagePageContent() {
  const { filters, update, apiQuery, ready } = useUsageFilters();
  const { report, sessions, loading, error } = useUsageReport(apiQuery, filters.page, ready);
  const { summary, loading: billingLoading } = useBilling();
  const bucket = report?.range.bucket ?? (filters.bucket === "week" ? "week" : "day");

  return (
    <>
      <DashboardPageHeader
        title="Usage"
        description="What this store spent, on which tool, and for how many shoppers"
        actions={
          ready ? (
            <a
              href={`/api/account/usage/export?${apiQuery}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3 text-xs font-semibold text-[var(--color-text-primary)]"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </a>
          ) : null
        }
      />
      <div className="p-6 space-y-6">
        <FilterBar filters={filters} generatedAt={report?.generatedAt ?? null} onChange={update} />
        {!ready ? (
          <p className="text-sm text-[var(--color-text-muted)]">Choose a start and end date to see this range.</p>
        ) : (
          <>
            {error && (
              <p className="rounded-[var(--radius-lg)] border border-[var(--color-error-solid)] px-4 py-3 text-sm text-[var(--color-error-solid)]">
                {error}
              </p>
            )}
            <AccountStrip summary={summary} />
            <KpiRow report={report} summary={summary} loading={loading} />
            <WalletMeters summary={summary} loading={billingLoading} />
            <SpendTrendChart
              points={filters.view === "units" ? (report?.seriesUnits ?? []) : (report?.seriesNanos ?? [])}
              bucket={bucket}
              view={filters.view}
              tool={filters.tool}
            />
            <ToolBreakdownTable lines={report?.tools ?? []} />
            <ShoppersTable
              shoppers={sessions?.shoppers ?? []}
              shopperCount={sessions?.shopperCount ?? 0}
              page={filters.page}
              pageSize={sessions?.pageSize ?? 25}
              onPage={(page) => update({ page })}
              onOpen={(shopper) => update({ shopper })}
            />
          </>
        )}
      </div>
      {filters.shopper && (
        <ShopperDrawer sessionId={filters.shopper} apiQuery={apiQuery} onClose={() => update({ shopper: "" })} />
      )}
    </>
  );
}
