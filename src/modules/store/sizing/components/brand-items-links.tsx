"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import type { BrandSourceLink, BrandSourceStatus } from "@/lib/sizing/brand-leaf-sources";

const LINK_CLASS =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)]";

/** What opening the link will show, in the words the merchant needs to decide whether to trust it. */
export function statusNote(link: Pick<BrandSourceLink, "status" | "labels">): string {
  switch (link.status) {
    case "filtered":
      return link.labels.length > 0 ? `Filtered to ${link.labels.join(" / ")}` : "Filtered to this brand";
    case "whole-collection":
      return "Opens the whole collection — turn on the Vendor filter in Search & Discovery to narrow it";
    case "unchecked":
      return "Filtered link; your storefront could not be checked to confirm it applies";
    case "not-filterable":
      return "Opens the whole collection — this brand is not stored somewhere a link can filter";
  }
}

const STATUS_TONE: Record<BrandSourceStatus, string> = {
  filtered: "text-[var(--color-success)]",
  unchecked: "text-[var(--color-text-muted)]",
  "whole-collection": "text-[var(--color-warning)]",
  "not-filterable": "text-[var(--color-warning)]",
};

/**
 * "View items" for one brand under one subcategory (or a chart's several): only the collections that
 * hold this brand's items there, each opening on the storefront already narrowed to the brand.
 * One collection opens directly; several open a short list with the count and what each link shows.
 */
export function BrandItemsLinks({
  links,
  brandName,
  label = "View items",
}: {
  links: readonly BrandSourceLink[];
  brandName: string;
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const linked = links.filter((link) => link.url);
  if (linked.length === 0) return null;

  const vendorPageUrl = linked.find((link) => link.status !== "filtered" && link.vendorPageUrl)?.vendorPageUrl ?? null;

  if (linked.length === 1 && !vendorPageUrl) {
    const [only] = linked;
    return (
      <a
        href={only.url!}
        target="_blank"
        rel="noopener noreferrer"
        title={`${only.name} · ${only.count.toLocaleString()} item${only.count === 1 ? "" : "s"}. ${statusNote(only)}`}
        className={cn(LINK_CLASS, "shrink-0")}
      >
        {label} <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((value) => !value)} className={LINK_CLASS} aria-expanded={open}>
        {label}
        {linked.length > 1 ? ` (${linked.length})` : ""}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-80 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-1.5 shadow-[var(--shadow-elevated)]">
          <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Where {brandName} sits
          </p>
          {linked.map((link) => (
            <a
              key={link.categoryId}
              href={link.url!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--color-brand-light)]/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-[var(--color-text-primary)]">{link.name}</span>
                <span className="block truncate text-[10px] text-[var(--color-text-muted)]">
                  {link.trail.join(" / ")} · {link.count.toLocaleString()} item{link.count === 1 ? "" : "s"}
                </span>
                <span className={cn("block text-[10px] leading-snug", STATUS_TONE[link.status])}>{statusNote(link)}</span>
              </span>
              <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-[var(--color-text-muted)]" />
            </a>
          ))}
          {vendorPageUrl && (
            <a
              href={vendorPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex items-center gap-2 rounded-md border-t border-[var(--color-border)] px-2 py-1.5 pt-2 text-xs font-semibold text-[var(--color-brand)] hover:bg-[var(--color-brand-light)]/50"
            >
              All {brandName} products <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
