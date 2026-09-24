"use client";

import Link from "next/link";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { Button } from "@/components/ui/button";
import { WsBrandingEditor } from "@/modules/workspaces/settings/ws-branding-editor";
import { useWorkspaceStore } from "@/modules/workspaces/store";

export default function BrandingPage() {
  const ws = useWorkspaceStore((s) => s.workspace);
  const hasLoaded = useWorkspaceStore((s) => s.hasLoaded);

  if (!hasLoaded) {
    return <DashboardPageHeader title="Branding & Embed" />;
  }

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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <DashboardPageHeader
        title="Branding & Embed"
        description="Customize your agent's appearance and get the embed snippet"
      />
      <WsBrandingEditor workspace={ws} />
    </div>
  );
}
