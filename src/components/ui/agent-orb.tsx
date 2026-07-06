"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import type { WorkspaceMode } from "@/modules/workspaces/types";

interface AgentOrbProps {
  mode: WorkspaceMode;
  size?: "sm" | "md" | "lg";
  animated?: boolean;
  className?: string;
}

const SIZE_CLASSES = { sm: "h-8 w-8", md: "h-12 w-12", lg: "h-16 w-16" };
const ICON_SIZE    = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-7 w-7" };

export function AgentOrb({ mode, size = "md", animated = false, className }: AgentOrbProps) {
  const isWearable = mode === "wearable";
  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-full",
        isWearable ? "gradient-wearable" : "gradient-unwearable",
        SIZE_CLASSES[size],
        "shadow-sm",
        animated && "ring-4",
        animated && (isWearable ? "ring-[var(--color-accent-light)]" : "ring-[var(--color-brand-light)]"),
        className
      )}
    >
      <span className={cn("text-white", ICON_SIZE[size])}>
        {isWearable ? "👗" : "⚡"}
      </span>
      {animated && (
        <span
          className={cn(
            "absolute inset-0 rounded-full opacity-40 animate-spin-slow",
            "border-2 border-dashed",
            isWearable ? "border-[var(--color-accent)]" : "border-[var(--color-brand)]"
          )}
        />
      )}
    </div>
  );
}
