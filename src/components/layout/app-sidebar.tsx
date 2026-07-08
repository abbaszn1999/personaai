"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Plug,
  BarChart2,
  Palette,
  Crown,
  CreditCard,
  Bell,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  User,
  Gauge,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { SidebarNavItem } from "./sidebar/sidebar-nav-item";
import { SidebarPreviewCta } from "./sidebar/sidebar-preview-cta";
import { SidebarWorkspaceCard } from "./sidebar/sidebar-workspace-card";
import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceStore } from "@/modules/workspaces/store";
import { useStoreConnectionStore } from "@/modules/store/store";
import { useUser } from "@/modules/auth/context/user-context";
import { cn } from "@/lib/utils/cn";

const COLLAPSE_KEY = "persona-ai.sidebar.collapsed";

let collapsedValue = false;
const collapseListeners = new Set<() => void>();

if (typeof window !== "undefined") {
  collapsedValue = window.localStorage.getItem(COLLAPSE_KEY) === "1";
}

function setSidebarCollapsed(value: boolean) {
  collapsedValue = value;
  try {
    window.localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
  collapseListeners.forEach((l) => l());
}

function useSidebarCollapsed() {
  return React.useSyncExternalStore(
    (cb) => {
      collapseListeners.add(cb);
      return () => collapseListeners.delete(cb);
    },
    () => collapsedValue,
    () => false
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { workspaces, activeWorkspaceId } = useWorkspaceStore();
  const connection = useStoreConnectionStore((s) => s.connection);
  const active = workspaces.find((w) => w.id === activeWorkspaceId);
  const collapsed = useSidebarCollapsed();
  const connected = connection?.status === "connected";

  function toggleCollapsed() {
    setSidebarCollapsed(!collapsed);
  }

  function isActive(href: string) {
    if (active && href === `/workspaces/${active.id}`) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  const manageNav = active
    ? [
        { label: "Dashboard", href: `/workspaces/${active.id}`, icon: <LayoutDashboard className="h-4 w-4" /> },
        { label: "Analytics", href: `/workspaces/${active.id}/analytics`, icon: <BarChart2 className="h-4 w-4" /> },
        { label: "Branding & Embed", href: `/workspaces/${active.id}/branding`, icon: <Palette className="h-4 w-4" /> },
      ]
    : [];

  const previewHref = active
    ? active.mode === "wearable"
      ? `/workspaces/${active.id}/try-on`
      : `/workspaces/${active.id}/assistant`
    : "#";

  const accountNav = [
    { label: "Store", href: "/store", icon: <Plug className="h-4 w-4" /> },
  ];

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 76 : 272 }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="relative flex h-full shrink-0 flex-col rounded-[var(--radius-2xl)] sidebar-panel sidebar-mesh overflow-hidden"
      >
        {/* ── Brand header ─────────────────────────────────────────── */}
        <div
          className={cn(
            "relative flex shrink-0 border-b border-[var(--color-sidebar-border)]",
            collapsed ? "flex-col items-center gap-2 px-2 py-3" : "items-center justify-between px-3 py-3.5"
          )}
        >
          <Link href="/" className="flex items-center gap-2.5 min-w-0 group">
            <span className="transition-transform group-hover:scale-105 drop-shadow-[0_0_12px_rgba(247,109,1,0.35)]">
              <LogoMark size={collapsed ? 32 : 36} />
            </span>
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15 }}
                  className="leading-none whitespace-nowrap"
                >
                  <span className="block text-sm font-display font-extrabold text-[var(--color-sidebar-text)] tracking-tight">
                    Persona AI
                  </span>
                  <span className="block text-[11px] text-[var(--color-sidebar-text-muted)] mt-0.5">by Autommerce</span>
                </motion.span>
              )}
            </AnimatePresence>
          </Link>

          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-sidebar-text-muted)] sidebar-glass sidebar-glass-hover transition-colors"
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* ── Workspace card ───────────────────────────────────────── */}
        <div className="shrink-0 pt-2.5">
          <SidebarWorkspaceCard
            workspace={active}
            collapsed={collapsed}
            storeConnected={connected}
            storeName={connection?.storeName ?? null}
          />
        </div>

        {/* ── Navigation ───────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden sidebar-scroll">
          <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 space-y-1">
            {!collapsed && active && (
              <p className="px-3 pt-1 pb-2 text-[10px] font-bold text-[var(--color-sidebar-text-muted)] uppercase tracking-widest">
                Manage
              </p>
            )}
            {active ? (
              <>
                {manageNav.map((item) => (
                  <SidebarNavItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={isActive(item.href)}
                    collapsed={collapsed}
                  />
                ))}

                <div className={cn("pt-3", collapsed ? "px-0" : "px-0.5")}>
                  {!collapsed && (
                    <p className="px-3 pb-2 text-[10px] font-bold text-[var(--color-sidebar-text-muted)] uppercase tracking-widest">
                      Agent
                    </p>
                  )}
                  <SidebarPreviewCta
                    href={previewHref}
                    mode={active.mode}
                    active={isActive(previewHref)}
                    collapsed={collapsed}
                  />
                </div>
              </>
            ) : (
              !collapsed && (
                <div className="px-3 py-6 text-center sidebar-glass rounded-[var(--radius-lg)] mx-1">
                  <p className="text-xs text-[var(--color-sidebar-text-muted)]">
                    Create a project to get started
                  </p>
                </div>
              )
            )}
          </nav>
        </div>

        {/* ── Account footer ───────────────────────────────────────── */}
        <div className={cn("shrink-0 border-t border-[var(--color-sidebar-border)]", collapsed ? "p-2" : "p-2.5")}>
          {!collapsed && (
            <p className="px-3 pb-2 text-[10px] font-bold text-[var(--color-sidebar-text-muted)] uppercase tracking-widest">
              Account
            </p>
          )}
          <div className={cn("space-y-1", !collapsed && "sidebar-glass rounded-[var(--radius-xl)] p-2")}>
            {accountNav.map((item) => (
              <SidebarNavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(item.href)}
                collapsed={collapsed}
              />
            ))}
            <SidebarAccountCard
              collapsed={collapsed}
              storeName={connection?.storeName ?? null}
              connected={connected}
            />
          </div>
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}

function SidebarAccountInfo() {
  const user = useUser();
  const name = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || "My Account"
    : "My Account";
  return (
    <div className="px-2.5 pb-2">
      <p className="text-sm font-semibold text-[var(--color-sidebar-text)]">{name}</p>
      <p className="text-xs text-[var(--color-sidebar-text-muted)]">{user?.email ?? ""}</p>
    </div>
  );
}

function SignOutButton() {
  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/sign-in";
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-[var(--color-error)]"
    >
      <LogOut className="h-4 w-4" /> Sign out
    </button>
  );
}

function SidebarAccountCard({
  collapsed,
  storeName,
  connected,
}: {
  collapsed: boolean;
  storeName: string | null;
  connected: boolean;
}) {
  const user = useUser();
  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
    : "My Account";
  const tier = user?.subscriptionTier ?? "free";
  const tierLabel = tier === "free" ? "Free" : tier.charAt(0).toUpperCase() + tier.slice(1);

  const trigger = (
    <button
      className={cn(
        "group flex items-center rounded-[var(--radius-lg)] w-full transition-all sidebar-glass-hover",
        collapsed ? "justify-center p-1.5 mt-1" : "gap-3 px-2.5 py-2.5 mt-1"
      )}
    >
      <div className="relative h-9 w-9 rounded-full gradient-brand flex items-center justify-center shrink-0 shadow-[var(--color-sidebar-active-glow)] ring-2 ring-[rgba(255,255,255,0.1)]">
        {user?.profileImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.profileImageUrl} alt={displayName} className="h-full w-full rounded-full object-cover" />
        ) : (
          <span className="text-white font-bold text-sm">
            {displayName.charAt(0).toUpperCase()}
          </span>
        )}
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-sidebar-bg)]",
            connected ? "bg-[var(--color-success)]" : "bg-[var(--color-sidebar-text-muted)]"
          )}
        />
      </div>
      {!collapsed && (
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-[var(--color-sidebar-text)] truncate">{displayName}</span>
            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full gradient-brand text-white shrink-0">
              <Crown className="h-2.5 w-2.5" />
              {tierLabel}
            </span>
          </div>
          <span className="text-[10px] text-[var(--color-sidebar-text-muted)] truncate block mt-0.5">
            {user?.email ?? (connected ? (storeName ?? "Connected") : "No store linked")}
          </span>
        </div>
      )}
    </button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent
              side="right"
              className="bg-[var(--color-sidebar-bg)] border-[var(--color-sidebar-border)] text-[var(--color-sidebar-text)]"
            >
              {displayName} · {tierLabel}
            </TooltipContent>
          </Tooltip>
        ) : (
          trigger
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={collapsed ? "right" : "top"}
        align={collapsed ? "end" : "start"}
        className="w-56 bg-[var(--color-sidebar-bg)] border-[var(--color-sidebar-border)] text-[var(--color-sidebar-text)]"
      >
        <DropdownMenuLabel className="text-[var(--color-sidebar-text-muted)]">Signed in as</DropdownMenuLabel>
        <SidebarAccountInfo />
        <DropdownMenuSeparator className="bg-[var(--color-sidebar-border)]" />
        <DropdownMenuItem asChild className="text-[var(--color-sidebar-text-muted)] data-[highlighted]:bg-[var(--color-sidebar-surface-hover)] data-[highlighted]:text-[var(--color-sidebar-text)]">
          <Link href="/settings?section=profile"><User className="h-4 w-4" /> Account Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="text-[var(--color-sidebar-text-muted)] data-[highlighted]:bg-[var(--color-sidebar-surface-hover)] data-[highlighted]:text-[var(--color-sidebar-text)]">
          <Link href="/settings?section=billing"><CreditCard className="h-4 w-4" /> Billing & Plan</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="text-[var(--color-sidebar-text-muted)] data-[highlighted]:bg-[var(--color-sidebar-surface-hover)] data-[highlighted]:text-[var(--color-sidebar-text)]">
          <Link href="/usage"><Gauge className="h-4 w-4" /> Usage</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="text-[var(--color-sidebar-text-muted)] data-[highlighted]:bg-[var(--color-sidebar-surface-hover)] data-[highlighted]:text-[var(--color-sidebar-text)]">
          <Link href="/settings?section=notifications"><Bell className="h-4 w-4" /> Notifications</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-[var(--color-sidebar-border)]" />
        <DropdownMenuItem danger asChild>
          <SignOutButton />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
