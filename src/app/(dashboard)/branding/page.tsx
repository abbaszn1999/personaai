"use client";

import Link from "next/link";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { Button } from "@/components/ui/button";
import { WsBrandingEditor } from "@/modules/workspaces/settings/ws-branding-editor";
import { useWorkspaceStore } from "@/modules/workspaces/store";

export default function BrandingPage() {
  const ws = useWorkspaceStore((s) => s.workspace);

  if (!ws) {
    return (
      <>
        <DashboardPageHeader title="Project not found" />
        <div className="p-6 flex flex-col items-center gap-4 py-16">
          <p className="text-[var(--color-text-muted)]">Create a project to configure branding.</p>
          <Link href="/setup"><Button variant="secondary">Create Project</Button></Link>
        </div>
      </>
    );
  }

  return (
    <>
      <DashboardPageHeader
        title="Branding & Embed"
        description="Customize your agent's appearance and get the embed snippet"
      />
      <div className="p-6">
        <WsBrandingEditor workspace={ws} />
      </div>
    </>
  );
}
