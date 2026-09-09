"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const SIZE_CLASSES = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
} as const;

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Pinned below the body, outside the scroll area. */
  footer?: React.ReactNode;
  size?: keyof typeof SIZE_CLASSES;
  children: React.ReactNode;
  className?: string;
}

/**
 * The shared shell behind every dialog in the dashboard. Header and footer stay pinned while only
 * the body scrolls, which matters for the size-chart and gap-fill dialogs — both can hold dozens
 * of measurement rows, and losing the save button off the bottom of a long table is the whole
 * reason this isn't one scrolling column.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  description,
  icon,
  footer,
  size = "lg",
  children,
  className,
}: ModalProps) {
  React.useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    // Without this the page behind keeps scrolling under the overlay on trackpads.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in"
      onMouseDown={(event) => {
        // mousedown rather than click, so a drag that starts inside the panel and releases on the
        // backdrop (selecting text in a table, resizing) doesn't count as dismissing the dialog.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "flex max-h-[85vh] w-full flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] shadow-[var(--shadow-modal)]",
          SIZE_CLASSES[size],
          className
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg gradient-brand text-white shadow-sm">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</p>
              {description && (
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{description}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
