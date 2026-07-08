"use client";

import * as React from "react";
import Link from "next/link";
import { Settings, Plus } from "lucide-react";
import { AgentOrb } from "@/components/ui/agent-orb";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WORKSPACE_MODE_LABELS } from "@/modules/workspaces/constants";
import type { Workspace } from "@/modules/workspaces/types";
import { cn } from "@/lib/utils/cn";

interface SidebarWorkspaceCardProps {
  workspace: Workspace | undefined;
  collapsed: boolean;
  storeConnected: boolean;
  storeName: string | null;
}

export function SidebarWorkspaceCard({
  workspace,
  collapsed,
  storeConnected,
  storeName,
}: SidebarWorkspaceCardProps) {
  const settingsButton = workspace && (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={`/workspaces/${workspace.id}/settings`}
          aria-label="Project settings"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-sidebar-text-muted)] sidebar-glass sidebar-glass-hover transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
        </Link>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        className="bg-[var(--color-sidebar-bg)] border-[var(--color-sidebar-border)] text-[var(--color-sidebar-text)]"
      >
        Project settings
      </TooltipContent>
    </Tooltip>
  );

  if (collapsed) {
    return (
      <div className="px-1 py-1 flex flex-col items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            {workspace ? (
              <div className="flex items-center justify-center p-1.5">
                <AgentOrb mode={workspace.mode} size="sm" />
              </div>
            ) : (
              <Link
                href="/setup"
                className="flex items-center justify-center p-1.5 rounded-[var(--radius-md)] sidebar-glass-hover transition-colors"
              >
                <div className="h-8 w-8 rounded-full gradient-brand shrink-0 flex items-center justify-center">
                  <Plus className="h-4 w-4 text-white" />
                </div>
              </Link>
            )}
          </TooltipTrigger>
          <TooltipContent
            side="right"
            className="bg-[var(--color-sidebar-bg)] border-[var(--color-sidebar-border)] text-[var(--color-sidebar-text)]"
          >
            {workspace?.name ?? "Add Project"}
          </TooltipContent>
        </Tooltip>
        {settingsButton}
      </div>
    );
  }

  return (
    <div className="mx-2.5 mb-2 rounded-[var(--radius-xl)] sidebar-glass p-3 space-y-2.5">
      <div className="flex items-center gap-1.5">
        {workspace ? (
          <div className="flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2">
            <AgentOrb mode={workspace.mode} size="sm" />
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm font-semibold truncate text-[var(--color-sidebar-text)]">
                {workspace.name}
              </div>
            </div>
          </div>
        ) : (
          <Link
            href="/setup"
            className="group flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius-lg)] sidebar-glass-hover transition-colors"
          >
            <div className="h-8 w-8 rounded-full gradient-brand shrink-0 flex items-center justify-center">
              <Plus className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm font-semibold truncate text-[var(--color-sidebar-text)] group-hover:text-[var(--color-brand)] transition-colors">
                Add Project
              </div>
            </div>
          </Link>
        )}
        {settingsButton}
      </div>

      {workspace && (
        <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-[var(--color-sidebar-border)]">
          <span
            className={cn(
              "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
              workspace.mode === "wearable"
                ? "bg-[rgba(107,53,141,0.35)] text-[#c8a8d2]"
                : "bg-[rgba(247,109,1,0.2)] text-[#ffb380]"
            )}
          >
            {WORKSPACE_MODE_LABELS[workspace.mode]}
          </span>
          <span className="flex items-center gap-1.5 min-w-0">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full shrink-0",
                storeConnected ? "bg-[var(--color-success)] animate-pulse-dot" : "bg-[var(--color-sidebar-text-muted)]"
              )}
            />
            <span className="text-[10px] text-[var(--color-sidebar-text-muted)] truncate">
              {storeConnected ? (storeName ?? "Store connected") : "No store"}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
