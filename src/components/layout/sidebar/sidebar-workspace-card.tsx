"use client";

import * as React from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { WorkspaceSwitcher } from "../workspace-switcher";
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
          aria-label="Workspace settings"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-sidebar-text-muted)] sidebar-glass sidebar-glass-hover transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
        </Link>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        className="bg-[var(--color-sidebar-bg)] border-[var(--color-sidebar-border)] text-[var(--color-sidebar-text)]"
      >
        Workspace settings
      </TooltipContent>
    </Tooltip>
  );

  if (collapsed) {
    return (
      <div className="px-1 py-1 flex flex-col items-center gap-1.5">
        <WorkspaceSwitcher collapsed variant="dark" />
        {settingsButton}
      </div>
    );
  }

  return (
    <div className="mx-2.5 mb-2 rounded-[var(--radius-xl)] sidebar-glass p-3 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <div className="flex-1 min-w-0">
          <WorkspaceSwitcher variant="dark" />
        </div>
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
