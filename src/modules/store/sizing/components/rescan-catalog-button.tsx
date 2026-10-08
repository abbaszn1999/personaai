"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { useSizingStore } from "../store";

const CONFIRMATION =
  "Read the catalog again?\n\nYour products are re-read from the store, so brands, subcategories and collections are refreshed. Size charts you already researched are kept.";

/**
 * Starts a fresh catalog scan. Needed because the scan only runs once per setup: anything the scan
 * learns later (a new per-product field, a changed store catalog) stays missing until it is read again.
 */
export function RescanCatalogButton({
  label = "Rescan catalog",
  variant = "button",
  className,
}: {
  label?: string;
  variant?: "button" | "link";
  className?: string;
}) {
  const rescan = useSizingStore((s) => s.rescanCatalog);
  const starting = useSizingStore((s) => s.startingRun);

  const onClick = () => {
    if (window.confirm(CONFIRMATION)) void rescan();
  };

  if (variant === "link") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={starting}
        className={cn(
          "inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-brand)] hover:underline disabled:opacity-50",
          className,
        )}
      >
        <RefreshCw className={cn("h-3 w-3", starting && "animate-spin")} /> {label}
      </button>
    );
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={starting} className={className}>
      <RefreshCw className={cn("h-3.5 w-3.5", starting && "animate-spin")} /> {label}
    </Button>
  );
}
