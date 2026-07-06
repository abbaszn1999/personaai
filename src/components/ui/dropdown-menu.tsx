"use client";

import * as React from "react";
import * as RadixDropdown from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils/cn";

export const DropdownMenu = RadixDropdown.Root;
export const DropdownMenuTrigger = RadixDropdown.Trigger;
export const DropdownMenuGroup = RadixDropdown.Group;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof RadixDropdown.Content>) {
  return (
    <RadixDropdown.Portal>
      <RadixDropdown.Content
        sideOffset={sideOffset}
        className={cn(
          "z-[70] min-w-[13rem] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-1.5 shadow-[var(--shadow-modal)]",
          "data-[state=open]:animate-fade-in origin-[--radix-dropdown-menu-content-transform-origin]",
          className
        )}
        {...props}
      />
    </RadixDropdown.Portal>
  );
}

export function DropdownMenuItem({
  className,
  inset,
  danger,
  ...props
}: React.ComponentProps<typeof RadixDropdown.Item> & { inset?: boolean; danger?: boolean }) {
  return (
    <RadixDropdown.Item
      className={cn(
        "flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-sm font-medium outline-none cursor-pointer transition-colors",
        danger
          ? "text-[var(--color-error)] data-[highlighted]:bg-[var(--color-error-light)]"
          : "text-[var(--color-text-secondary)] data-[highlighted]:bg-[var(--color-brand-light)] data-[highlighted]:text-[var(--color-brand-strong)]",
        inset && "pl-8",
        className
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof RadixDropdown.Label>) {
  return (
    <RadixDropdown.Label
      className={cn("px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof RadixDropdown.Separator>) {
  return (
    <RadixDropdown.Separator
      className={cn("my-1 h-px bg-[var(--color-border)]", className)}
      {...props}
    />
  );
}
