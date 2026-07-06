"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";

export interface SidebarNavItemProps {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  collapsed: boolean;
  badge?: string;
  description?: string;
}

export function SidebarNavItem({
  href,
  label,
  icon,
  active,
  collapsed,
  badge,
  description,
}: SidebarNavItemProps) {
  const link = (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center rounded-[var(--radius-lg)] transition-all duration-200",
        collapsed ? "h-11 w-11 mx-auto justify-center" : "gap-3 px-2.5 py-2",
        active && "sidebar-nav-active-glow"
      )}
    >
      {active && !collapsed && (
        <motion.span
          layoutId="sidebar-active-row"
          className="absolute inset-0 rounded-[var(--radius-lg)] sidebar-glass border-[rgba(255,255,255,0.12)]"
          transition={{ type: "spring", stiffness: 400, damping: 34 }}
        />
      )}
      {active && !collapsed && (
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

      {!collapsed && (
        <>
          <span className="relative z-10 flex-1 min-w-0">
            <span
              className={cn(
                "block truncate text-sm font-medium",
                active ? "text-[var(--color-sidebar-text)]" : "text-[var(--color-sidebar-text-muted)] group-hover:text-[var(--color-sidebar-text)]"
              )}
            >
              {label}
            </span>
            {(badge || description) && (
              <span className="block text-[10px] text-[var(--color-sidebar-text-muted)] truncate mt-0.5">
                {badge ?? description}
              </span>
            )}
          </span>
          {active && <ChevronRight className="relative z-10 h-3.5 w-3.5 shrink-0 text-[var(--color-brand)] opacity-80" />}
        </>
      )}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="bg-[var(--color-sidebar-bg)] border-[var(--color-sidebar-border)] text-[var(--color-sidebar-text)]">
        {label}
        {badge ? ` · ${badge}` : ""}
      </TooltipContent>
    </Tooltip>
  );
}
