"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plug,
  BarChart2,
  Palette,
  Crown,
  CreditCard,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  User,
  Gauge,
  ImageIcon,
  Clock3,
  FolderTree,
  Ruler,
  SlidersHorizontal,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { SidebarNavItem } from "./sidebar/sidebar-nav-item";
import { SidebarNavGroup } from "./sidebar/sidebar-nav-group";
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
import { ThemeToggle } from "@/modules/theme/theme-toggle";

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
  const searchParams = useSearchParams();
  const active = useWorkspaceStore((s) => s.workspace);
  const connection = useStoreConnectionStore((s) => s.connection);
  const collapsed = useSidebarCollapsed();
  const connected = connection?.status === "connected";

  function toggleCollapsed() {
    setSidebarCollapsed(!collapsed);
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  const manageNav = active
    ? [
        { label: "Analytics", href: "/analytics", icon: <BarChart2 className="h-4 w-4" /> },
        { label: "Branding & Embed", href: "/branding", icon: <Palette className="h-4 w-4" /> },
      ]
    : [];

  const previewHref = active ? "/try-on" : "#";

  const storeSection = searchParams.get("section") ?? "connection";
  const storeActive = pathname === "/store";
  const storeChildren = [
    {
      label: "Connection",
      href: "/store?section=connection",
      icon: <Plug className="h-3.5 w-3.5" />,
      active: storeActive && storeSection === "connection",
    },
    // Universal category setup: real store PLPs mapped onto Persona's fixed taxonomy.
    {
      label: "Mapping",
      href: "/store?section=mapping",
      icon: <FolderTree className="h-3.5 w-3.5" />,
      active: storeActive && storeSection === "mapping",
      disabled: !connection,
    },
    // Setup ends by building the index, so there is no separate Catalog Sync tab above it — having
    // one let a merchant index before the sizing pipeline had produced anything to index.
    {
      label: "Setup",
      href: "/store?section=setup",
      icon: <Ruler className="h-3.5 w-3.5" />,
      active: storeActive && storeSection === "setup",
      disabled: !connection,
    },
    {
      label: "Size Filter",
      href: "/store?section=sizefilter",
      icon: <SlidersHorizontal className="h-3.5 w-3.5" />,
      active: storeActive && storeSection === "sizefilter",
      disabled: !connection,
    },
    // Style Guide sits last so the tabs above it read as the setup pipeline, in order.
    {
      label: "Style Guide",
      href: "/store?section=style",
      icon: <Palette className="h-3.5 w-3.5" />,
      active: storeActive && storeSection === "style",
      disabled: !connection,
    },
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

          <div className={cn("flex shrink-0 items-center gap-1", collapsed && "flex-col")}>
            <ThemeToggle />
            <button
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-sidebar-text-muted)] sidebar-glass sidebar-glass-hover transition-colors"
            >
              {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </button>
          </div>
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
                <SidebarNavGroup
                  label="Store"
                  href="/store?section=connection"
                  icon={<Plug className="h-4 w-4" />}
                  active={storeActive}
                  collapsed={collapsed}
                >
                  {storeChildren}
                </SidebarNavGroup>

                <div className={cn("pt-3", collapsed ? "px-0" : "px-0.5")}>
                  {!collapsed && (
                    <p className="px-3 pb-2 text-[10px] font-bold text-[var(--color-sidebar-text-muted)] uppercase tracking-widest">
                      Agent
                    </p>
                  )}
                  <SidebarPreviewCta
                    href={previewHref}
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
          {active && <SidebarUsageBalance workspaceId={active.id} collapsed={collapsed} />}
          {!collapsed && (
            <p className="px-3 pb-2 text-[10px] font-bold text-[var(--color-sidebar-text-muted)] uppercase tracking-widest">
              Account
            </p>
          )}
          <div className={cn("space-y-1", !collapsed && "sidebar-glass rounded-[var(--radius-xl)] p-2")}>
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

interface SidebarUsageSummary {
  images: {
    includedRemaining: number;
    creditsBalance: number;
  };
  liveTryOn: {
    includedRemainingSeconds: number;
    purchasedSecondsBalance: number;
  };
}

function SidebarUsageBalance({ workspaceId, collapsed }: { workspaceId: string; collapsed: boolean }) {
  const [usage, setUsage] = React.useState<SidebarUsageSummary | null>(null);

  const load = React.useCallback(async () => {
    try {
      const response = await fetch(
        `/api/account/billing-summary?workspaceId=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" }
      );
      if (!response.ok) return;
      setUsage((await response.json()) as SidebarUsageSummary);
    } catch {
      // The persistent sidebar should remain usable if usage data is temporarily unavailable.
    }
  }, [workspaceId]);

  React.useEffect(() => {
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
  }, [load]);

  const imagesRemaining = usage
    ? usage.images.includedRemaining + usage.images.creditsBalance
    : null;
  const secondsRemaining = usage
    ? usage.liveTryOn.includedRemainingSeconds + usage.liveTryOn.purchasedSecondsBalance
    : null;
  const minutesRemaining = secondsRemaining === null ? null : Math.ceil(secondsRemaining / 60);

  if (collapsed) {
    return (
      <div className="mb-2 flex flex-col gap-1">
        <SidebarUsageItem
          collapsed
          icon={<ImageIcon className="h-3.5 w-3.5" />}
          value={imagesRemaining === null ? "—" : imagesRemaining.toLocaleString()}
          tooltip={`${imagesRemaining?.toLocaleString() ?? "—"} images remaining`}
        />
        <SidebarUsageItem
          collapsed
          icon={<Clock3 className="h-3.5 w-3.5" />}
          value={minutesRemaining === null ? "—" : `${minutesRemaining}m`}
          tooltip={`${minutesRemaining ?? "—"} live try-on minutes remaining`}
        />
      </div>
    );
  }

  return (
    <Link
      href="/usage"
      className="mb-2 block rounded-[var(--radius-xl)] border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] p-2.5 transition-colors hover:bg-[var(--color-sidebar-surface-hover)]"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-sidebar-text-muted)]">
          Remaining usage
        </span>
        <Gauge className="h-3.5 w-3.5 text-[var(--color-sidebar-text-muted)]" />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <SidebarUsageItem
          icon={<ImageIcon className="h-3.5 w-3.5" />}
          value={imagesRemaining === null ? "—" : imagesRemaining.toLocaleString()}
          label="Images"
        />
        <SidebarUsageItem
          icon={<Clock3 className="h-3.5 w-3.5" />}
          value={minutesRemaining === null ? "—" : `${minutesRemaining}m`}
          label="Live"
        />
      </div>
    </Link>
  );
}

function SidebarUsageItem({
  icon,
  value,
  label,
  collapsed = false,
  tooltip,
}: {
  icon: React.ReactNode;
  value: string;
  label?: string;
  collapsed?: boolean;
  tooltip?: string;
}) {
  const content = (
    <span
      className={cn(
        "flex items-center rounded-[var(--radius-md)] bg-[rgba(255,255,255,0.055)] text-[var(--color-sidebar-text)]",
        collapsed ? "h-9 flex-col justify-center gap-0 px-1" : "gap-1.5 px-2 py-1.5"
      )}
    >
      <span className="text-[var(--color-brand)]">{icon}</span>
      <span className={cn("font-bold leading-none", collapsed ? "text-[8px]" : "text-[11px]")}>{value}</span>
      {!collapsed && label && (
        <span className="text-[9px] text-[var(--color-sidebar-text-muted)]">{label}</span>
      )}
    </span>
  );

  if (!collapsed) return content;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent
        side="right"
        className="bg-[var(--color-sidebar-bg)] border-[var(--color-sidebar-border)] text-[var(--color-sidebar-text)]"
      >
        {tooltip}
      </TooltipContent>
    </Tooltip>
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
  const tier = user?.subscriptionTier ?? "trial";
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

  const trigger = (
    <button
      className={cn(
        "group flex items-center rounded-[var(--radius-lg)] w-full transition-all sidebar-glass-hover",
        collapsed ? "justify-center p-1.5 mt-1" : "gap-3 px-2.5 py-2.5 mt-1"
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full gradient-brand text-sm font-semibold text-white">
        {user?.profileImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.profileImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          displayName.charAt(0).toUpperCase()
        )}
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
          <Link href="/settings"><User className="h-4 w-4" /> Account</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="text-[var(--color-sidebar-text-muted)] data-[highlighted]:bg-[var(--color-sidebar-surface-hover)] data-[highlighted]:text-[var(--color-sidebar-text)]">
          <Link href="/settings/billing"><CreditCard className="h-4 w-4" /> Billing & Plan</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="text-[var(--color-sidebar-text-muted)] data-[highlighted]:bg-[var(--color-sidebar-surface-hover)] data-[highlighted]:text-[var(--color-sidebar-text)]">
          <Link href="/usage"><Gauge className="h-4 w-4" /> Usage</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-[var(--color-sidebar-border)]" />
        <DropdownMenuItem danger asChild>
          <SignOutButton />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
