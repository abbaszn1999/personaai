"use client";

import { use } from "react";
import Link from "next/link";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { Button } from "@/components/ui/button";
import { WorkspaceSettingsDashboard } from "@/modules/workspaces/settings/workspace-settings-dashboard";
import { useWorkspaceStore } from "@/modules/workspaces/store";

interface Props { params: Promise<{ id: string }> }

export default function WorkspaceSettingsPage({ params }: Props) {
  const { id } = use(params);
  const { workspaces } = useWorkspaceStore();
  const ws = workspaces.find((w) => w.id === id);

  if (!ws) {
    return (
      <>
        <DashboardPageHeader title="Project not found" />
        <div className="p-6 flex flex-col items-center gap-4 py-16">
          <p className="text-[var(--color-text-muted)]">This project does not exist.</p>
          <Link href="/workspaces"><Button variant="secondary">Back to Project</Button></Link>
        </div>
      </>
    );
  }

  return (
    <>
      <DashboardPageHeader
        title={`${ws.name} — Settings`}
        description="Manage this project's configuration"
      />
      <div className="p-6">
        <WorkspaceSettingsDashboard workspace={ws} />
      </div>
    </>
  );
}
