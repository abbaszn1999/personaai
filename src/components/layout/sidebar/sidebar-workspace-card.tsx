"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Workspace } from "@/modules/workspaces/types";
import { cn } from "@/lib/utils/cn";

interface SidebarWorkspaceCardProps {
  workspace: Workspace | null | undefined;
  collapsed: boolean;
  storeConnected: boolean;
  storeName: string | null;
}

function initialOf(name: string): string {
  const letter = name.trim().charAt(0).toUpperCase();
  return letter || "?";
}

/** Project identity, not the person. A rounded square with the project initial
 *  is how workspace switchers stay distinct from the account photo below. */
function ProjectMark({ name }: { name: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] gradient-brand text-sm font-semibold text-white">
      {initialOf(name)}
    </span>
  );
}

export function SidebarWorkspaceCard({
  workspace,
  collapsed,
  storeConnected,
  storeName,
}: SidebarWorkspaceCardProps) {
  const storeLabel = storeConnected ? (storeName ?? "Store connected") : "No store";

  if (collapsed) {
    return (
      <div className="flex flex-col items-center px-1 py-1">
        <Tooltip>
          <TooltipTrigger asChild>
            {workspace ? (
              <div className="flex items-center justify-center p-1">
                <ProjectMark name={workspace.name} />
              </div>
            ) : (
              <Link
                href="/setup"
                className="flex items-center justify-center rounded-[var(--radius-md)] p-1.5 sidebar-glass-hover transition-colors"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] gradient-brand">
                  <Plus className="h-4 w-4 text-white" />
                </span>
              </Link>
            )}
          </TooltipTrigger>
          <TooltipContent
            side="right"
            className="bg-[var(--color-sidebar-bg)] border-[var(--color-sidebar-border)] text-[var(--color-sidebar-text)]"
          >
            {workspace ? `${workspace.name} · ${storeLabel}` : "Add Project"}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="mx-2.5 mb-2">
        <Link
          href="/setup"
          className="group flex items-center gap-2.5 rounded-[var(--radius-xl)] sidebar-glass px-3 py-2.5 sidebar-glass-hover transition-colors"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] gradient-brand">
            <Plus className="h-4 w-4 text-white" />
          </span>
          <span className="truncate text-sm font-semibold text-[var(--color-sidebar-text)] group-hover:text-[var(--color-brand)] transition-colors">
            Add Project
          </span>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-2.5 mb-2 rounded-[var(--radius-xl)] sidebar-glass px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <ProjectMark name={workspace.name} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-tight text-[var(--color-sidebar-text)]">
            {workspace.name}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                storeConnected ? "bg-[var(--color-success)]" : "bg-[var(--color-sidebar-text-muted)]"
              )}
            />
            <span className="truncate text-[10px] leading-none text-[var(--color-sidebar-text-muted)]">
              {storeLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
