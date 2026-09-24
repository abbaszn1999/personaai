"use client";

import * as React from "react";
import Link from "next/link";
import { Clock3, ImageIcon, Plus, Users } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Workspace } from "@/modules/workspaces/types";
import { cn } from "@/lib/utils/cn";

interface SidebarWorkspaceCardProps {
  workspace: Workspace | null | undefined;
  workspaceId: string | null;
  collapsed: boolean;
}

interface BalanceSummary {
  images: { includedRemaining: number; creditsBalance: number };
  liveTryOn: { includedRemainingSeconds: number; purchasedSecondsBalance: number };
  sessions: { includedRemaining: number; unitsBalance: number };
}

function formatCount(value: number | null): string {
  return value === null ? "—" : value.toLocaleString();
}

export function SidebarWorkspaceCard({ workspace, workspaceId, collapsed }: SidebarWorkspaceCardProps) {
  const [balance, setBalance] = React.useState<BalanceSummary | null>(null);

  const load = React.useCallback(async () => {
    if (!workspaceId) return;
    try {
      const response = await fetch(
        `/api/account/billing-summary?workspaceId=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" }
      );
      if (!response.ok) return;
      setBalance((await response.json()) as BalanceSummary);
    } catch {
      // The sidebar stays usable if the balance is temporarily unavailable.
    }
  }, [workspaceId]);

  React.useEffect(() => {
    if (!workspaceId) return;
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 30_000);
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    window.addEventListener("autommerce:usage-changed", refresh);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("autommerce:usage-changed", refresh);
    };
  }, [load, workspaceId]);

  if (!workspace) {
    return <AddProject collapsed={collapsed} />;
  }

  const sessions = balance ? balance.sessions.includedRemaining + Math.max(balance.sessions.unitsBalance, 0) : null;
  const liveSeconds = balance
    ? balance.liveTryOn.includedRemainingSeconds + Math.max(balance.liveTryOn.purchasedSecondsBalance, 0)
    : null;
  const liveMinutes = liveSeconds === null ? null : Math.ceil(liveSeconds / 60);
  const garments = balance ? balance.images.includedRemaining + Math.max(balance.images.creditsBalance, 0) : null;

  const rows = [
    { icon: <Users className="h-3.5 w-3.5" />, label: "Sessions", value: formatCount(sessions), tooltip: "Sessions remaining" },
    { icon: <Clock3 className="h-3.5 w-3.5" />, label: "Live", value: liveMinutes === null ? "—" : `${liveMinutes}m`, tooltip: "Live minutes remaining" },
    { icon: <ImageIcon className="h-3.5 w-3.5" />, label: "Garments", value: formatCount(garments), tooltip: "Garment images remaining" },
  ];

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 px-1 py-1">
        {rows.map((row) => (
          <Tooltip key={row.label}>
            <TooltipTrigger asChild>
              <Link
                href="/usage"
                className="flex h-9 w-11 flex-col items-center justify-center rounded-[var(--radius-md)] sidebar-glass text-[var(--color-sidebar-text)]"
              >
                <span className="text-[var(--color-brand)]">{row.icon}</span>
                <span className="text-[8px] font-bold leading-none">{row.value}</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              className="border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-bg)] text-[var(--color-sidebar-text)]"
            >
              {row.tooltip}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    );
  }

  return (
    <Link
      href="/usage"
      className="mx-2.5 mb-2 block rounded-[var(--radius-xl)] sidebar-glass px-3 py-2.5 transition-colors hover:bg-[var(--color-sidebar-surface-hover)]"
    >
      <span className="block px-0.5 pb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--color-sidebar-text-muted)]">
        Balance
      </span>
      <span className="grid grid-cols-3 gap-1">
        {rows.map((row) => (
          <span key={row.label} className="flex min-w-0 flex-col items-center gap-1 rounded-[var(--radius-md)] bg-[rgba(255,255,255,0.055)] px-1 py-1.5">
            <span className="text-[var(--color-brand)]">{row.icon}</span>
            <span className="text-[11px] font-bold leading-none text-[var(--color-sidebar-text)]">{row.value}</span>
            <span className="truncate text-[9px] leading-none text-[var(--color-sidebar-text-muted)]">{row.label}</span>
          </span>
        ))}
      </span>
    </Link>
  );
}

function AddProject({ collapsed }: { collapsed: boolean }) {
  const link = (
    <Link
      href="/setup"
      className={cn(
        "group flex items-center rounded-[var(--radius-xl)] sidebar-glass sidebar-glass-hover transition-colors",
        collapsed ? "justify-center p-1.5" : "mx-2.5 mb-2 gap-2.5 px-3 py-2.5"
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] gradient-brand">
        <Plus className="h-4 w-4 text-white" />
      </span>
      {!collapsed && (
        <span className="truncate text-sm font-semibold text-[var(--color-sidebar-text)] transition-colors group-hover:text-[var(--color-brand)]">
          Add Project
        </span>
      )}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <div className="flex justify-center px-1 py-1">
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent
          side="right"
          className="border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-bg)] text-[var(--color-sidebar-text)]"
        >
          Add Project
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
