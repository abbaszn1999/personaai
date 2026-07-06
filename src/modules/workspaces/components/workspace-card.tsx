"use client";

import * as React from "react";
import Link from "next/link";
import { Eye, SlidersHorizontal, Plug, FolderOpen } from "lucide-react";
import type { Workspace } from "@/modules/workspaces/types";
import { WORKSPACE_MODE_LABELS } from "@/modules/workspaces/constants";
import { PLATFORM_LABELS } from "@/modules/store/constants";
import { Card, CardContent } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { AgentOrb } from "@/components/ui/agent-orb";
import { Button } from "@/components/ui/button";

interface WorkspaceCardProps {
  workspace: Workspace;
  isActive?: boolean;
  onActivate?: () => void;
}

export function WorkspaceCard({ workspace, isActive, onActivate }: WorkspaceCardProps) {
  const previewHref =
    workspace.mode === "wearable"
      ? `/workspaces/${workspace.id}/try-on`
      : `/workspaces/${workspace.id}/assistant`;
  const settingsHref = `/workspaces/${workspace.id}/settings`;

  return (
    <Card
      className={`transition-all duration-200 ${isActive ? "ring-2 ring-[var(--color-brand)]" : "hover:shadow-[var(--shadow-elevated)]"}`}
    >
      <CardContent className="pt-5">
        <div className="flex items-start gap-3">
          <AgentOrb mode={workspace.mode} size="md" animated={isActive} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] truncate">
                {workspace.name}
              </h3>
              <StatusPill status={workspace.status} />
            </div>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
              {WORKSPACE_MODE_LABELS[workspace.mode]}
            </p>
          </div>
        </div>

        {/* Store connection */}
        <div className="mt-4 flex items-center gap-2 text-sm">
          <Plug className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
          {workspace.storeConnection ? (
            <span className="text-[var(--color-text-secondary)]">
              {PLATFORM_LABELS[workspace.storeConnection.platform]} ·{" "}
              {workspace.storeConnection.storeName}
            </span>
          ) : (
            <span className="text-[var(--color-text-muted)]">No store connected</span>
          )}
        </div>

        {/* Categories */}
        <div className="mt-2 flex items-center gap-2 text-sm">
          <FolderOpen className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
          <span className="text-[var(--color-text-secondary)]">
            {workspace.selectedCategoryIds.length} categories selected
          </span>
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-2">
          <Link href={previewHref} className="flex-1">
            <Button size="sm" className="w-full gap-1">
              <Eye className="h-3.5 w-3.5" />
              Open Preview
            </Button>
          </Link>
          <Link href={settingsHref}>
            <Button size="sm" variant="secondary" title="Workspace Settings">
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </Button>
          </Link>
          {!isActive && onActivate && (
            <Button size="sm" variant="secondary" onClick={onActivate}>
              Set Active
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
