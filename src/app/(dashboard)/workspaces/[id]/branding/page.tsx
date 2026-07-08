"use client";

import { use } from "react";
import Link from "next/link";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { Button } from "@/components/ui/button";
import { WsBrandingEditor } from "@/modules/workspaces/settings/ws-branding-editor";
import { useWorkspaceStore } from "@/modules/workspaces/store";

interface Props { params: Promise<{ id: string }> }

export default function WorkspaceBrandingPage({ params }: Props) {
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
        title="Branding & Embed"
        description="Customize your agent's appearance and get the embed snippet"
      />
      <div className="p-6">
        <WsBrandingEditor workspace={ws} />
      </div>
    </>
  );
}
