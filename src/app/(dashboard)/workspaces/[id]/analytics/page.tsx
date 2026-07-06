"use client";

import { use } from "react";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { AnalyticsDashboard } from "@/modules/analytics/components/analytics-dashboard";
import { useWorkspaceStore } from "@/modules/workspaces/store";

interface Props { params: Promise<{ id: string }> }

export default function WorkspaceAnalyticsPage({ params }: Props) {
  const { id } = use(params);
  const { workspaces } = useWorkspaceStore();
  const ws = workspaces.find((w) => w.id === id);

  return (
    <>
      <DashboardPageHeader
        title="Analytics"
        description={ws ? `Performance for ${ws.name}` : "Workspace analytics"}
      />
      <div className="p-6">
        <AnalyticsDashboard workspaceId={id} />
      </div>
    </>
  );
}
