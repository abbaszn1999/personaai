"use client";

import * as React from "react";
import { BatteryFull, Signal, Wifi } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** CSS pixels of the phone's screen — a current mainstream handset (iPhone 14/15 class). */
export const MOBILE_SCREEN_WIDTH = 390;
export const MOBILE_SCREEN_HEIGHT = 780;

const BEZEL = 10;
const DEVICE_WIDTH = MOBILE_SCREEN_WIDTH + BEZEL * 2;
const DEVICE_HEIGHT = MOBILE_SCREEN_HEIGHT + BEZEL * 2;
const STATUS_BAR_HEIGHT = 48;
const HOME_BAR_HEIGHT = 26;
/** Room kept around the phone inside the preview area (caption + breathing space). */
const CAPTION_HEIGHT = 28;
const PADDING = 12;
const MIN_SCALE = 0.45;

interface MobileDeviceFrameProps {
  /** Chat fills the whole screen; onboarding steps hug the top and scroll when they run long. */
  layout: "card" | "full";
  children: React.ReactNode;
}

/**
 * A phone-shaped preview viewport. The screen is always the same real 390×780 CSS-pixel size —
 * so everything inside lays out exactly as it would on a handset, whatever the dashboard window
 * looks like — and the whole device is scaled down uniformly when the preview area is shorter
 * than a phone, instead of squeezing the layout inside it. Content that is taller than the
 * screen scrolls inside it, like a real page.
 */
export function MobileDeviceFrame({ layout, children }: MobileDeviceFrameProps) {
  const [host, setHost] = React.useState<HTMLDivElement | null>(null);
  const [scale, setScale] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!host) return;
    const measure = (width: number, height: number) => {
      const byHeight = (height - CAPTION_HEIGHT - PADDING * 2) / DEVICE_HEIGHT;
      const byWidth = (width - PADDING * 2) / DEVICE_WIDTH;
      setScale(Math.max(MIN_SCALE, Math.min(1, byHeight, byWidth)));
    };
    const rect = host.getBoundingClientRect();
    measure(rect.width, rect.height);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) measure(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [host]);

  const s = scale ?? 1;

  return (
    <div
      ref={setHost}
      className="flex h-full min-h-0 w-full flex-col items-center justify-center overflow-auto"
      style={{ padding: PADDING }}
    >
      <div
        className={cn("relative shrink-0 transition-opacity duration-150", scale === null && "opacity-0")}
        style={{ width: DEVICE_WIDTH * s, height: DEVICE_HEIGHT * s }}
      >
        <div
          className="absolute left-0 top-0"
          style={{ width: DEVICE_WIDTH, height: DEVICE_HEIGHT, transform: `scale(${s})`, transformOrigin: "top left" }}
        >
          {/* Hardware buttons */}
          <span aria-hidden className="absolute -left-[3px] top-[120px] h-8 w-[3px] rounded-l bg-[#2a2733]" />
          <span aria-hidden className="absolute -left-[3px] top-[172px] h-14 w-[3px] rounded-l bg-[#2a2733]" />
          <span aria-hidden className="absolute -left-[3px] top-[240px] h-14 w-[3px] rounded-l bg-[#2a2733]" />
          <span aria-hidden className="absolute -right-[3px] top-[190px] h-20 w-[3px] rounded-r bg-[#2a2733]" />

          <div
            className="relative h-full w-full rounded-[56px] bg-[#0d0b12] shadow-[0_30px_70px_rgba(0,0,0,0.45),inset_0_0_0_2px_#2a2733]"
            style={{ padding: BEZEL }}
          >
            <div
              className="@container relative flex h-full w-full flex-col overflow-hidden rounded-[46px] bg-[var(--color-surface-card)]"
              // The avatar carousel sizes itself from this instead of the browser window's height.
              style={{ ["--avatar-slide-h" as string]: "340px" }}
            >
              {/* Status bar + dynamic island */}
              <div
                className="relative z-20 flex shrink-0 items-center justify-between px-8 pt-1.5 text-[var(--color-text-primary)]"
                style={{ height: STATUS_BAR_HEIGHT }}
              >
                <span className="text-[13px] font-semibold tabular-nums">9:41</span>
                <span
                  aria-hidden
                  className="absolute left-1/2 top-2.5 h-[26px] w-[96px] -translate-x-1/2 rounded-full bg-[#0d0b12]"
                />
                <span className="flex items-center gap-1.5">
                  <Signal className="h-3.5 w-3.5" />
                  <Wifi className="h-3.5 w-3.5" />
                  <BatteryFull className="h-4 w-4" />
                </span>
              </div>

              {/* The page itself */}
              <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain sidebar-scroll", layout === "full" && "flex flex-col")}>
                <div className={cn(layout === "full" ? "min-h-0 flex-1" : "min-h-full")}>{children}</div>
              </div>

              {/* Home indicator */}
              <div className="flex shrink-0 items-center justify-center" style={{ height: HOME_BAR_HEIGHT }}>
                <div className="h-[5px] w-[134px] rounded-full bg-[var(--color-text-primary)] opacity-70" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-[var(--color-text-muted)]" style={{ height: CAPTION_HEIGHT - 8 }}>
        Mobile preview · {MOBILE_SCREEN_WIDTH} × {MOBILE_SCREEN_HEIGHT}
        {scale !== null && scale < 1 ? ` · ${Math.round(scale * 100)}%` : ""}
      </p>
    </div>
  );
}
