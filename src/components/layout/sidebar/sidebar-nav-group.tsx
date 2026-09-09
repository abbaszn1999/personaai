"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";

export interface SidebarNavGroupChild {
  label: string;
  href: string;
  icon: React.ReactNode;
  active: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

interface SidebarNavGroupProps {
  label: string;
  href: string;
  icon: React.ReactNode;
  active: boolean;
  collapsed: boolean;
  children: SidebarNavGroupChild[];
}

/**
 * Same look and animated active-pill identity as `SidebarNavItem` (shares its
 * `sidebar-active-row`/`sidebar-active-bar` layoutIds so the highlight glides
 * between Store and the other top-level items exactly like it does between
 * them), but toggles a list of child links open/closed instead of navigating
 * directly — Store is the only entry with sub-pages.
 */
export function SidebarNavGroup({
  label,
  href,
  icon,
  active,
  collapsed,
  children,
}: SidebarNavGroupProps) {
  const [open, setOpen] = React.useState(active);

  React.useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  if (collapsed) {
    const link = (
      <Link
        href={href}
        className={cn(
          "group relative mx-auto flex h-11 w-11 items-center justify-center rounded-[var(--radius-lg)] transition-all duration-200",
          active && "sidebar-nav-active-glow"
        )}
      >
        <span className={cn("relative z-10 sidebar-icon-pill shrink-0", active && "sidebar-icon-pill-active")}>
          {icon}
        </span>
      </Link>
    );

    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent
          side="right"
          className="border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-bg)] text-[var(--color-sidebar-text)]"
        >
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="store-nav-children"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "group relative flex w-full items-center gap-3 rounded-[var(--radius-lg)] px-2.5 py-2 transition-all duration-200",
          active && "sidebar-nav-active-glow"
        )}
      >
        {active && (
          <motion.span
            layoutId="sidebar-active-row"
            className="absolute inset-0 rounded-[var(--radius-lg)] sidebar-glass border-[rgba(255,255,255,0.12)]"
            transition={{ type: "spring", stiffness: 400, damping: 34 }}
          />
        )}
        {active && (
          <motion.span
            layoutId="sidebar-active-bar"
            className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full gradient-brand z-10"
            transition={{ type: "spring", stiffness: 400, damping: 34 }}
          />
        )}

        <span
          className={cn(
            "relative z-10 sidebar-icon-pill shrink-0",
            active && "sidebar-icon-pill-active",
            !active && "group-hover:border-[rgba(255,255,255,0.15)] group-hover:text-[var(--color-sidebar-text)]"
          )}
        >
          {icon}
        </span>

        <span
          className={cn(
            "relative z-10 flex-1 min-w-0 truncate text-left text-sm font-medium",
            active ? "text-[var(--color-sidebar-text)]" : "text-[var(--color-sidebar-text-muted)] group-hover:text-[var(--color-sidebar-text)]"
          )}
        >
          {label}
        </span>

        <ChevronDown
          className={cn(
            "relative z-10 h-3.5 w-3.5 shrink-0 text-[var(--color-sidebar-text-muted)] transition-transform duration-200",
            active && "text-[var(--color-brand)] opacity-80",
            open && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="store-nav-children"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-[var(--color-sidebar-border)] pl-3 pt-0.5">
              {children.map((child) => {
                const content = (
                  <span
                    className={cn(
                      "flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-sm font-medium transition-colors",
                      child.disabled
                        ? "cursor-not-allowed text-[var(--color-sidebar-text-muted)] opacity-40"
                        : child.active
                          ? "bg-[var(--color-sidebar-surface-hover)] text-[var(--color-brand)]"
                          : "text-[var(--color-sidebar-text-muted)] hover:bg-[var(--color-sidebar-surface-hover)] hover:text-[var(--color-sidebar-text)]"
                    )}
                  >
                    <span className="shrink-0">{child.icon}</span>
                    <span className="truncate">{child.label}</span>
                  </span>
                );

                if (child.disabled) {
                  return (
                    <Tooltip key={child.href}>
                      <TooltipTrigger asChild>
                        <div aria-disabled="true">{content}</div>
                      </TooltipTrigger>
                      <TooltipContent
                        side="right"
                        className="border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-bg)] text-[var(--color-sidebar-text)]"
                      >
                        {child.disabledReason ?? "Connect a store first"}
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return (
                  <Link key={child.href} href={child.href}>
                    {content}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
