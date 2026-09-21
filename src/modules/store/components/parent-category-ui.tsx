"use client";

import * as React from "react";
import { Footprints, Layers, Shield, Shirt, Sparkles } from "lucide-react";
import {
  SIZING_GROUP_KEYS,
  SIZING_GROUP_LABELS,
  type SizingGroup,
} from "@/lib/sizing/measurements";
import { cn } from "@/lib/utils/cn";
import { MappingSelect } from "./mapping-select";

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
    <MappingSelect
      options={options.map((group) => ({ key: group, label: parentLabel(group) }))}
      value={value ?? ""}
      onChange={(next) => onChange(next as SizingGroup)}
      label={label ? `Parent sizing category for ${label}` : "Parent sizing category"}
      placeholder="Not mapped yet"
      className="w-full"
    />
  );
}
