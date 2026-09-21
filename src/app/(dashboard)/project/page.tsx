"use client";

import Link from "next/link";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { Button } from "@/components/ui/button";
import { WorkspaceSettingsDashboard } from "@/modules/workspaces/settings/workspace-settings-dashboard";
import { useWorkspaceStore } from "@/modules/workspaces/store";

export default function ProjectSettingsPage() {
  const ws = useWorkspaceStore((s) => s.workspace);

  if (!ws) {
    return (
      <>
        <DashboardPageHeader title="Project not found" />
        <div className="p-6 flex flex-col items-center gap-4 py-16">
          <p className="text-[var(--color-text-muted)]">Create a project to manage its settings.</p>
          <Link href="/setup"><Button variant="secondary">Create Project</Button></Link>
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
