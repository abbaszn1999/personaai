"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface SetupProgressBarProps {
  /**
   * 0–100. Omitted for work whose end isn't knowable — the catalog scan, whose total is only known
   * once the walk finishes — which renders the indeterminate sweep instead of a made-up percentage.
   */
  percent?: number;
  className?: string;
}

export function SetupProgressBar({ percent, className }: SetupProgressBarProps) {
  const determinate = typeof percent === "number";
  const value = determinate ? Math.min(100, Math.max(0, Math.round(percent))) : undefined;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className={cn("setup-progress-track", className)}
    >
      <div
        className={cn("setup-progress-fill", !determinate && "setup-progress-indeterminate")}
        style={determinate ? { width: `${value}%` } : undefined}
      />
    </div>
  );
}
