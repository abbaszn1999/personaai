"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface ClientPreviewFrameProps {
  children: React.ReactNode;
  className?: string;
}

/** Wraps preview content to mimic the embedded shopper widget shell. */
export function ClientPreviewFrame({ children, className }: ClientPreviewFrameProps) {
  return (
    <div className="flex items-center justify-center min-h-[640px] py-6">
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
