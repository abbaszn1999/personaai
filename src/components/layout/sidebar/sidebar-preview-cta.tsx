"use client";

import * as React from "react";
import Link from "next/link";
import { Shirt, BotMessageSquare, Sparkles, ArrowRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";
import type { WorkspaceMode } from "@/modules/workspaces/types";

interface SidebarPreviewCtaProps {
  href: string;
  mode: WorkspaceMode;
  active: boolean;
  collapsed: boolean;
}

export function SidebarPreviewCta({ href, mode, active, collapsed }: SidebarPreviewCtaProps) {
  const isWearable = mode === "wearable";
  const label = isWearable ? "Virtual Try-On" : "Shopping Assistant";

  const card = (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center rounded-[var(--radius-xl)] transition-all duration-200 overflow-hidden",
        collapsed ? "h-11 w-11 mx-auto justify-center" : "gap-3 p-3",
        active
          ? "sidebar-nav-active-glow"
          : "hover:brightness-110"
      )}
    >
      {/* Gradient border background */}
      <span
        className={cn(
          "absolute inset-0 rounded-[var(--radius-xl)] opacity-90",
          isWearable ? "gradient-wearable" : "gradient-unwearable"
        )}
      />
      <span className="absolute inset-[1px] rounded-[var(--radius-xl)] bg-[var(--color-sidebar-bg)]/90 backdrop-blur-sm" />

      <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
        {isWearable ? <Shirt className="h-4 w-4" /> : <BotMessageSquare className="h-4 w-4" />}
      </span>

      {!collapsed && (
        <>
          <span className="relative z-10 flex-1 min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-sidebar-text)]">
              Preview
              <Sparkles className="h-3 w-3 text-[var(--color-brand)]" />
            </span>
            <span className="block text-[10px] text-[var(--color-sidebar-text-muted)] mt-0.5">{label}</span>
          </span>
          <ArrowRight className="relative z-10 h-4 w-4 text-[var(--color-sidebar-text-muted)] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
        </>
      )}
    </Link>
  );

  if (!collapsed) return card;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent side="right" className="bg-[var(--color-sidebar-bg)] border-[var(--color-sidebar-border)] text-[var(--color-sidebar-text)]">
        Preview · {label}
      </TooltipContent>
    </Tooltip>
  );
}
