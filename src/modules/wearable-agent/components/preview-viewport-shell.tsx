"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { MobileDeviceFrame, MOBILE_SCREEN_HEIGHT, MOBILE_SCREEN_WIDTH } from "./mobile-device-frame";
import type { PreviewViewportMode } from "./preview-viewport-toggle";

interface PreviewViewportShellProps {
  mode: PreviewViewportMode;
  /** Card = centered onboarding widget; full = chat/agent fills the preview area. */
  layout?: "card" | "full";
  /** True for a real embed (widget.js / `/embed/[token]`) rendering on an actual narrow device
   *  — skips the phone-frame chrome below, which only makes sense as dashboard preview
   *  decoration. A real embed already sits inside the shopper's actual device viewport, so
   *  `mode === "mobile"` just needs the real mobile content layout at the widget's own size,
   *  same as the desktop branches below. */
  frameless?: boolean;
  /** Floated over the card (the profile switcher). Rendered on the card's own box, not on the
   *  full-width host, so a centered desktop card keeps it in its top corner. Sits outside the
   *  card's overflow clip so its menu can open past the rounded edge. */
  overlay?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps shopper-facing preview UI in either full desktop space or a phone frame.
 *
 * The card branches are `@container`s so onboarding steps can switch layout on the width of the
 * card they actually sit in (a 390px phone screen on a wide dashboard window must look like a
 * phone, not like the window) rather than on the browser window's width.
 */
export function PreviewViewportShell({
  mode,
  layout = "card",
  frameless = false,
  overlay,
  children,
  className,
}: PreviewViewportShellProps) {
  if (mode === "mobile" && !frameless) {
    return <MobileDeviceFrame layout={layout}>{children}</MobileDeviceFrame>;
  }

  if (layout === "full") {
    return <div className={cn("h-full min-h-0", className)}>{children}</div>;
  }

  // Real embed onboarding (frameless) — hug the card on every viewport so the leftover
  // merchant page around it stays the page scroller. `overscroll-contain` + a leftover-
  // viewport host is what used to trap the wheel / swipe inside an empty gray slab.
  if (frameless) {
    return (
      <div className={cn("w-full", mode === "desktop" && "flex justify-center", className)}>
        <div className={cn("relative", mode === "desktop" ? "w-full max-w-2xl" : "w-full")}>
          {overlay}
          <div
            className={cn(
              "@container overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)]",
              "bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)]"
            )}
          >
            {children}
          </div>
        </div>
      </div>
    );
  }

  return (
    // `m-auto` on the card (not items-center / justify-center on this scroller): centering a
    // card taller than the pane pushes its top edge above the scroll origin, where it can never
    // be scrolled back to. Auto margins centre it when it fits and pin it to the top when not.
    <div className="flex h-full min-h-0 overflow-y-auto py-6 sidebar-scroll">
      <div
        className={cn(
          "@container m-auto w-full rounded-[var(--radius-2xl)] border border-[var(--color-border)]",
          "max-w-2xl",
          "bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)] overflow-hidden",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}

export { MOBILE_SCREEN_HEIGHT as MOBILE_AGENT_HEIGHT, MOBILE_SCREEN_WIDTH as MOBILE_WIDTH };
