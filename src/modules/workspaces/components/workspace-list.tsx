"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, FolderOpen } from "lucide-react";
import { WorkspaceCard } from "./workspace-card";
import { useWorkspaces } from "../hooks/use-workspaces";
import { useUser } from "@/modules/auth/context/user-context";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export function WorkspaceList() {
  const { workspaces, activeWorkspaceId, setActive } = useWorkspaces();
  const user = useUser();
  const canCreateWorkspace = !user || workspaces.length < user.workspaceLimit;
  const router = useRouter();

  if (workspaces.length === 0) {
    return (
      <EmptyState
        icon={<FolderOpen className="h-6 w-6" />}
        title="No project yet"
        description="Create your project to start configuring your AI shopping assistant."
        action={{ label: "Create Project", onClick: () => router.push("/setup") }}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            Your Project
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            {workspaces.length} project{workspaces.length !== 1 ? "s" : ""}
          </p>
        </div>
        {canCreateWorkspace && (
          <Link href="/setup">
            <Button size="md">
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {workspaces.map((ws) => (
          <WorkspaceCard
            key={ws.id}
            workspace={ws}
            isActive={ws.id === activeWorkspaceId}
            onActivate={() => setActive(ws.id)}
          />
        ))}
      </div>
    </div>
  );
}
