"use client";

import * as React from "react";
import { Footprints, Layers, Shield, Shirt, Sparkles } from "lucide-react";
import {
  SIZING_GROUP_KEYS,
  SIZING_GROUP_LABELS,
  type SizingGroup,
} from "@/lib/sizing/measurements";
import { cn } from "@/lib/utils/cn";

const ACCENTS: Record<SizingGroup, string> = {
  tops: "var(--color-parent-tops)",
  outerwear: "var(--color-parent-outerwear)",
  bottoms: "var(--color-parent-bottoms)",
  dresses: "var(--color-parent-dresses)",
  footwear: "var(--color-parent-footwear)",
};

const ICONS: Record<SizingGroup, React.ComponentType<{ className?: string }>> = {
  tops: Shirt,
  outerwear: Shield,
  bottoms: Layers,
  dresses: Sparkles,
  footwear: Footprints,
};

export function parentLabel(group: SizingGroup): string {
  return SIZING_GROUP_LABELS[group];
}

export function parentAccent(group: SizingGroup): string {
  return ACCENTS[group];
}

export function ParentIcon({ group, className }: { group: SizingGroup; className?: string }) {
  const Icon = ICONS[group];
  return <Icon className={cn("h-4 w-4", className)} />;
}

export function ParentSelect({
  value,
  onChange,
  label,
  options = SIZING_GROUP_KEYS,
}: {
  value: SizingGroup | null;
  onChange: (group: SizingGroup) => void;
  label?: string;
  options?: readonly SizingGroup[];
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value as SizingGroup)}
      aria-label={label ? `Parent sizing category for ${label}` : "Parent sizing category"}
      className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-sticky)] px-2.5 py-1.5 text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]"
    >
      {!value && <option value="" disabled>Not mapped yet</option>}
      {options.map((group) => <option key={group} value={group}>{parentLabel(group)}</option>)}
    </select>
  );
}

export interface AnchoredPanelRect {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  available: number;
  themeClass: string;
}

/** Positions listbox portals outside overflow-clipped cards. */
export function useAnchoredPanel(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  estimatedHeight = 200,
): AnchoredPanelRect | null {
  const [rect, setRect] = React.useState<AnchoredPanelRect | null>(null);

  React.useLayoutEffect(() => {
    if (!open) return;
    function measure() {
      const element = ref.current;
      if (!element) return;
      const box = element.getBoundingClientRect();
      const below = window.innerHeight - box.bottom - 6;
      const above = box.top - 6;
      const flip = below < estimatedHeight && above > below;
      setRect({
        ...(flip ? { bottom: window.innerHeight - box.top + 6 } : { top: box.bottom + 6 }),
        left: box.left,
        width: box.width,
        available: Math.max(120, flip ? above : below),
        themeClass: document.documentElement.className,
      });
    }
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [estimatedHeight, open, ref]);

  return rect;
}
