"use client";

import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { AnalyticsDashboard } from "@/modules/analytics/components/analytics-dashboard";
import { LiveSessionsIndicator } from "@/modules/analytics/components/live-sessions-indicator";
import { useWorkspaceStore } from "@/modules/workspaces/store";

export default function AnalyticsPage() {
  const ws = useWorkspaceStore((s) => s.workspace);

  return (
    <>
      <DashboardPageHeader
        title="Analytics"
        description={ws ? `Performance for ${ws.name}` : "Project analytics"}
        actions={ws ? <LiveSessionsIndicator workspaceId={ws.id} /> : undefined}
      />
      <div className="p-6">
        <AnalyticsDashboard workspaceId={ws?.id} />
      </div>
    </>
  );
}
