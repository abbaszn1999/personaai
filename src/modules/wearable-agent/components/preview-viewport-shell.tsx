"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import type { PreviewViewportMode } from "./preview-viewport-toggle";

interface PreviewViewportShellProps {
  mode: PreviewViewportMode;
  /** Card = centered onboarding widget; full = chat/agent fills the preview area. */
  layout?: "card" | "full";
  /** True for a real embed (widget.js / `/embed/[token]`) rendering on an actual narrow device
   *  — skips the fake phone-bezel chrome below (fixed 390px frame with notch bars), which only
   *  makes sense as dashboard preview decoration. A real embed already sits inside the
   *  shopper's actual device viewport, so `mode === "mobile"` just needs the real mobile
   *  content layout at the widget's own size, same as the desktop branches below. */
  frameless?: boolean;
  children: React.ReactNode;
  className?: string;
}

const MOBILE_WIDTH = 390;
const MOBILE_AGENT_HEIGHT = 812;

/** Wraps shopper-facing preview UI in either full desktop space or a phone frame. */
export function PreviewViewportShell({
  mode,
  layout = "card",
  frameless = false,
  children,
  className,
}: PreviewViewportShellProps) {
  if (mode === "mobile" && !frameless) {
    return (
      <div className="flex h-full min-h-0 items-start justify-center overflow-y-auto py-4 sidebar-scroll">
        <div className="shrink-0 px-2" style={{ width: MOBILE_WIDTH }}>
          <div className="rounded-[40px] border-[6px] border-[#121018] bg-[#121018] shadow-[0_28px_72px_rgba(0,0,0,0.55)] overflow-hidden">
            <div className="flex h-7 items-center justify-center bg-[#121018]">
              <div className="h-1 w-[72px] rounded-full bg-white/20" />
            </div>
            <div
              className={cn(
                "overflow-hidden bg-[var(--color-surface-card)]",
                layout === "full" ? "h-[812px]" : "min-h-[680px]"
              )}
            >
              {children}
            </div>
            <div className="flex h-5 items-center justify-center bg-[#121018]">
              <div className="h-1 w-[96px] rounded-full bg-white/25" />
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-[var(--color-text-muted)]">
            Mobile preview · {MOBILE_WIDTH}px
          </p>
        </div>
      </div>
    );
  }

  if (layout === "full") {
    return <div className={cn("h-full min-h-0", className)}>{children}</div>;
  }

  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto py-6 sidebar-scroll">
      <div
        className={cn(
          "w-full max-w-2xl rounded-[var(--radius-2xl)] border border-[var(--color-border)]",
          "bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)] overflow-hidden",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}

export { MOBILE_AGENT_HEIGHT, MOBILE_WIDTH };
