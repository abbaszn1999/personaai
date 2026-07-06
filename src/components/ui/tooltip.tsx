"use client";

import * as React from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils/cn";

export const TooltipProvider = RadixTooltip.Provider;
export const Tooltip = RadixTooltip.Root;
export const TooltipTrigger = RadixTooltip.Trigger;

export function TooltipContent({
  className,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof RadixTooltip.Content>) {
  return (
    <RadixTooltip.Portal>
      <RadixTooltip.Content
        sideOffset={sideOffset}
        className={cn(
          "z-[70] rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-text-inverse)] shadow-[var(--shadow-elevated)]",
          "data-[state=delayed-open]:animate-fade-in select-none",
          className
        )}
        {...props}
      />
    </RadixTooltip.Portal>
  );
}
