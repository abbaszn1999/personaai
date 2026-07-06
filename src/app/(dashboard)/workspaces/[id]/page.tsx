"use client";

import { use } from "react";
import Link from "next/link";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { WorkspaceOverview } from "@/modules/workspaces/components/workspace-overview";
import { useWorkspaceStore } from "@/modules/workspaces/store";

interface Props { params: Promise<{ id: string }> }

export default function WorkspaceDetailPage({ params }: Props) {
  const { id } = use(params);
  const { workspaces } = useWorkspaceStore();
  const ws = workspaces.find((w) => w.id === id);

  if (!ws) {
    return (
      <>
        <DashboardPageHeader title="Workspace not found" />
        <div className="p-6 flex flex-col items-center gap-4 py-16">
          <p className="text-[var(--color-text-muted)]">This workspace does not exist.</p>
          <Link href="/workspaces"><Button variant="secondary">Back to Workspaces</Button></Link>
        </div>
      </>
    );
  }

  return (
    <>
      <DashboardPageHeader
        title={ws.name}
        description="Workspace overview"
        actions={<StatusPill status={ws.status} />}
      />
      <div className="p-6">
        <WorkspaceOverview workspace={ws} />
      </div>
    </>
  );
}
