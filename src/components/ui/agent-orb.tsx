"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface AgentOrbProps {
  size?: "sm" | "md" | "lg";
  animated?: boolean;
  className?: string;
}

const SIZE_CLASSES = { sm: "h-8 w-8", md: "h-12 w-12", lg: "h-16 w-16" };
const ICON_SIZE    = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-7 w-7" };

export function AgentOrb({ size = "md", animated = false, className }: AgentOrbProps) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-full",
        "gradient-wearable",
        SIZE_CLASSES[size],
        "shadow-sm",
        animated && "ring-4 ring-[var(--color-accent-light)]",
        className
      )}
    >
      <span className={cn("text-white", ICON_SIZE[size])}>👗</span>
      {animated && (
        <span
          className={cn(
            "absolute inset-0 rounded-full opacity-40 animate-spin-slow",
            "border-2 border-dashed border-[var(--color-accent)]"
          )}
        />
      )}
    </div>
  );
}
