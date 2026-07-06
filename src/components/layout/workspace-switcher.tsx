"use client";

import * as React from "react";
import { ChevronDown, Plus, Check } from "lucide-react";
import { useWorkspaceStore } from "@/modules/workspaces/store";
import { useUser } from "@/modules/auth/context/user-context";
import { AgentOrb } from "@/components/ui/agent-orb";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";
import { useRouter } from "next/navigation";

interface WorkspaceSwitcherProps {
  collapsed?: boolean;
  variant?: "light" | "dark";
}

export function WorkspaceSwitcher({ collapsed = false, variant = "light" }: WorkspaceSwitcherProps) {
  const [open, setOpen] = React.useState(false);
  const { workspaces, activeWorkspaceId, setActiveWorkspace } = useWorkspaceStore();
  const active = workspaces.find((w) => w.id === activeWorkspaceId);
  const user = useUser();
  const canCreateWorkspace = !user || workspaces.length < user.workspaceLimit;
  const router = useRouter();
  const ref = React.useRef<HTMLDivElement>(null);
  const isDark = variant === "dark";

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectWorkspace(id: string) {
    setActiveWorkspace(id);
    setOpen(false);
    router.push(`/workspaces/${id}`);
  }

  const trigger = (
    <button
      onClick={() => setOpen((o) => !o)}
      className={cn(
        "flex w-full items-center rounded-[var(--radius-lg)] border transition-all duration-200",
        isDark
          ? cn(
              "sidebar-glass sidebar-glass-hover border-[var(--color-sidebar-border)]",
              open && "bg-[var(--color-sidebar-surface-hover)] border-[rgba(255,255,255,0.14)]"
            )
          : cn(
              "border-transparent hover:bg-[var(--color-surface-base)] hover:border-[var(--color-border)]",
              open && "bg-[var(--color-surface-base)] border-[var(--color-border)]"
            ),
        collapsed ? "justify-center p-1.5" : "gap-2.5 px-2.5 py-2"
      )}
    >
      {active ? (
        <AgentOrb mode={active.mode} size="sm" />
      ) : (
        <div className="h-8 w-8 rounded-full gradient-brand shrink-0" />
      )}
      {!collapsed && (
        <>
          <div className="flex-1 min-w-0 text-left">
            <div
              className={cn(
                "text-sm font-semibold truncate",
                isDark ? "text-[var(--color-sidebar-text)]" : "text-[var(--color-text-primary)]"
              )}
            >
              {active?.name ?? "No Workspace"}
            </div>
            <div
              className={cn(
                "text-xs capitalize",
                isDark ? "text-[var(--color-sidebar-text-muted)]" : "text-[var(--color-text-muted)]"
              )}
            >
              {active?.mode ?? "—"}
            </div>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform shrink-0",
              isDark ? "text-[var(--color-sidebar-text-muted)]" : "text-[var(--color-text-muted)]",
              open && "rotate-180"
            )}
          />
        </>
      )}
    </button>
  );

  const dropdownClasses = isDark
    ? "z-50 rounded-[var(--radius-xl)] border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-bg)] py-1 shadow-[var(--shadow-modal)] animate-fade-in"
    : "z-50 card-elevated py-1 shadow-[var(--shadow-modal)] animate-fade-in";

  return (
    <div className="relative" ref={ref}>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent
            side="right"
            className={isDark ? "bg-[var(--color-sidebar-bg)] border-[var(--color-sidebar-border)] text-[var(--color-sidebar-text)]" : undefined}
          >
            {active?.name ?? "No Workspace"} · Switch workspace
          </TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}

      {open && (
        <div
          className={cn(
            dropdownClasses,
            collapsed ? "absolute left-full top-0 ml-2 w-60" : "absolute top-full left-0 right-0 mt-1.5"
          )}
        >
          <p
            className={cn(
              "px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest",
              isDark ? "text-[var(--color-sidebar-text-muted)]" : "text-[var(--color-text-muted)]"
            )}
          >
            Workspaces
          </p>
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => selectWorkspace(ws.id)}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2 transition-colors",
                isDark
                  ? "hover:bg-[var(--color-sidebar-surface-hover)]"
                  : "hover:bg-[var(--color-surface-base)]"
              )}
            >
              <AgentOrb mode={ws.mode} size="sm" />
              <div className="flex-1 min-w-0 text-left">
                <div
                  className={cn(
                    "text-sm font-medium truncate",
                    isDark ? "text-[var(--color-sidebar-text)]" : "text-[var(--color-text-primary)]"
                  )}
                >
                  {ws.name}
                </div>
                <div
                  className={cn(
                    "text-xs capitalize",
                    isDark ? "text-[var(--color-sidebar-text-muted)]" : "text-[var(--color-text-muted)]"
                  )}
                >
                  {ws.mode}
                </div>
              </div>
              {ws.id === activeWorkspaceId && (
                <Check className="h-4 w-4 text-[var(--color-brand)] shrink-0" />
              )}
            </button>
          ))}
          {canCreateWorkspace && (
            <div className={cn("mt-1 pt-1 border-t", isDark ? "border-[var(--color-sidebar-border)]" : "border-[var(--color-border)]")}>
              <button
                onClick={() => { setOpen(false); router.push("/setup"); }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-sm font-medium transition-colors",
                  isDark
                    ? "text-[var(--color-brand)] hover:bg-[var(--color-sidebar-surface-hover)]"
                    : "text-[var(--color-brand-strong)] hover:bg-[var(--color-brand-light)]"
                )}
              >
                <Plus className="h-4 w-4" />
                New Workspace
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
