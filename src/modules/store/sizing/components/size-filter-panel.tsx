"use client";

import * as React from "react";
import {
  Lock,
  ArrowRight,
  RotateCcw,
  Info,
  Shirt,
  Footprints,
  Watch,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { cn } from "@/lib/utils/cn";
import { useSizingStore } from "../store";
import { FILTER_PRESETS, INITIAL_FILTER_CONFIGS } from "../mocks/filter";
import type { BrandFilterOverride, CategoryFilterConfig } from "../types";

/** Slider bounds. The upper end is generous enough for outerwear layering without going absurd. */
const MAX_TOLERANCE_CM = 15;
const STEP_CM = 0.5;

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  tops: <Shirt className="h-4 w-4" />,
  bottoms: <Shirt className="h-4 w-4 rotate-180" />,
  outerwear: <Shirt className="h-4 w-4" />,
  dresses: <Shirt className="h-4 w-4" />,
  footwear: <Footprints className="h-4 w-4" />,
  accessories: <Watch className="h-4 w-4" />,
  headwear: <Watch className="h-4 w-4" />,
};

/**
 * How strictly a size has to match before Persona rules an item out.
 *
 * The tolerance widens the range a shopper is checked against; it never edits the chart. That
 * distinction matters because charts are shared across stores — a merchant who finds their stock
 * runs large is describing their own catalog, not correcting the brand's published numbers.
 */
export function SizeFilterPanel() {
  const extractionDone = useSizingStore((s) => s.extractionDone);
  const configs = useSizingStore((s) => s.filterConfigs);
  const updateFilterConfig = useSizingStore((s) => s.updateFilterConfig);

  const [activeId, setActiveId] = React.useState(configs[0]?.id ?? "");
  const active = configs.find((config) => config.id === activeId) ?? configs[0];

  function applyPreset(multiplier: number) {
    for (const config of configs) {
      const baseline = INITIAL_FILTER_CONFIGS.find((item) => item.id === config.id);
      if (!baseline) continue;
      updateFilterConfig(config.id, {
        defaultIncreaseCm: round(baseline.defaultIncreaseCm * multiplier),
        defaultDecreaseCm: round(baseline.defaultDecreaseCm * multiplier),
      });
    }
  }

  if (!extractionDone) {
    return <PrerequisiteNotice />;
  }

  if (!active) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
        <p className="text-xs text-[var(--color-text-muted)]">
          These widen the range a shopper is checked against before an item is ruled out. Tighter
          means fewer, more confident results; looser keeps borderline fits in play for the agent to
          judge. The size charts themselves are never changed.
        </p>
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Start from a preset
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {FILTER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset.multiplier)}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-3 text-left transition-all hover:border-[var(--color-brand)]"
            >
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                {preset.label}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                {preset.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      <SegmentedTabs
        items={configs.map((config) => ({
          id: config.id,
          label: config.name,
          icon: CATEGORY_ICONS[config.categoryType],
        }))}
        activeId={active.id}
        onSelect={setActiveId}
      />

      <CategoryFilterEditor
        config={active}
        onChange={(patch) => updateFilterConfig(active.id, patch)}
      />
    </div>
  );
}

function PrerequisiteNotice() {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-xl)] bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]">
        <Lock className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">
          Finish Setup first
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-[var(--color-text-muted)]">
          There is nothing to tune until your catalog has size charts behind it. Run the Setup
          pipeline through to publishing, then come back and decide how strict the fit filter should
          be.
        </p>
      </div>
      <Link href="/store?section=setup">
        <Button size="sm">
          Go to Setup <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </Link>
    </div>
  );
}

function CategoryFilterEditor({
  config,
  onChange,
}: {
  config: CategoryFilterConfig;
  onChange: (patch: Partial<CategoryFilterConfig>) => void;
}) {
  const baseline = INITIAL_FILTER_CONFIGS.find((item) => item.id === config.id);

  function setBrandOverride(brand: string, override: BrandFilterOverride | null) {
    const next = { ...config.brandOverrides };
    if (override) next[brand] = override;
    else delete next[brand];
    onChange({ brandOverrides: next });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{config.name}</h3>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            {config.categoryPath} · {config.skuCount.toLocaleString()} items
          </p>
        </div>
        {baseline && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({
                defaultIncreaseCm: baseline.defaultIncreaseCm,
                defaultDecreaseCm: baseline.defaultDecreaseCm,
                brandOverrides: baseline.brandOverrides,
              })
            }
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset to default
          </Button>
        )}
      </div>

      <MarginVisualization config={config} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ToleranceSlider
          label="Allow larger"
          hint="How far above a size's range a shopper can measure and still see it"
          value={config.defaultIncreaseCm}
          onChange={(value) => onChange({ defaultIncreaseCm: value })}
        />
        <ToleranceSlider
          label="Allow smaller"
          hint="How far below a size's range a shopper can measure and still see it"
          value={config.defaultDecreaseCm}
          onChange={(value) => onChange({ defaultDecreaseCm: value })}
        />
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Per-brand overrides
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
          For brands that consistently run large or small in your own experience.
        </p>
        <div className="mt-2 space-y-2">
          {config.brands.map((brand) => (
            <BrandOverrideRow
              key={brand.name}
              name={brand.name}
              skuCount={brand.skuCount}
              fitNote={brand.fitNote}
              override={config.brandOverrides[brand.name]}
              fallback={{
                increaseCm: config.defaultIncreaseCm,
                decreaseCm: config.defaultDecreaseCm,
              }}
              onChange={(override) => setBrandOverride(brand.name, override)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The base chart range against the range the filter actually checks.
 *
 * Rendered on a fixed domain — widest possible tolerance on both sides — rather than one that
 * rescales with the sliders, so dragging visibly grows the band instead of leaving it the same
 * width while the axis silently changes underneath it.
 */
function MarginVisualization({ config }: { config: CategoryFilterConfig }) {
  const { min, max, unit, sizeLabel } = config.sampleBaseRange;

  const domainMin = min - MAX_TOLERANCE_CM;
  const domainMax = max + MAX_TOLERANCE_CM;
  const span = domainMax - domainMin;
  const pct = (value: number) => ((value - domainMin) / span) * 100;

  const effectiveMin = min - config.defaultDecreaseCm;
  const effectiveMax = max + config.defaultIncreaseCm;

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-[var(--color-text-primary)]">
          {config.sampleMeasurement} · size {sizeLabel}
        </p>
        <Badge variant="neutral" className="font-mono text-[10px]">
          {effectiveMin.toFixed(1)}–{effectiveMax.toFixed(1)} {unit}
        </Badge>
      </div>

      <div className="relative mt-4 h-9">
        <div className="absolute inset-x-0 top-3 h-3 rounded-full bg-[var(--color-surface-elevated)]" />

        <div
          className="absolute top-3 h-3 rounded-full bg-[var(--color-brand)]/25"
          style={{ left: `${pct(effectiveMin)}%`, width: `${pct(effectiveMax) - pct(effectiveMin)}%` }}
        />

        <div
          className="absolute top-3 h-3 rounded-full gradient-brand"
          style={{ left: `${pct(min)}%`, width: `${Math.max(1.5, pct(max) - pct(min))}%` }}
        />

        <span
          className="absolute top-0 -translate-x-1/2 font-mono text-[10px] text-[var(--color-text-muted)]"
          style={{ left: `${pct(effectiveMin)}%` }}
        >
          {effectiveMin.toFixed(1)}
        </span>
        <span
          className="absolute top-0 -translate-x-1/2 font-mono text-[10px] text-[var(--color-text-muted)]"
          style={{ left: `${pct(effectiveMax)}%` }}
        >
          {effectiveMax.toFixed(1)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full gradient-brand" /> Chart range ({min}–{max} {unit})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-[var(--color-brand)]/25" /> Also shown
        </span>
      </div>
    </div>
  );
}

function ToleranceSlider({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[var(--color-text-primary)]">{label}</p>
        <span className="font-mono text-xs text-[var(--color-brand)]">+{value.toFixed(1)} cm</span>
      </div>
      <input
        type="range"
        min={0}
        max={MAX_TOLERANCE_CM}
        step={STEP_CM}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2.5 w-full accent-[var(--color-brand)]"
      />
      <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">{hint}</p>
    </div>
  );
}

function BrandOverrideRow({
  name,
  skuCount,
  fitNote,
  override,
  fallback,
  onChange,
}: {
  name: string;
  skuCount: number;
  fitNote?: string;
  override?: BrandFilterOverride;
  fallback: { increaseCm: number; decreaseCm: number };
  onChange: (override: BrandFilterOverride | null) => void;
}) {
  const isOverridden = Boolean(override);
  const increase = override?.increaseCm ?? fallback.increaseCm;
  const decrease = override?.decreaseCm ?? fallback.decreaseCm;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border p-3",
        isOverridden
          ? "border-[var(--color-brand)]/40 bg-[var(--color-brand-light)]"
          : "border-[var(--color-border)] bg-[var(--color-surface-base)]"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">{name}</p>
          {fitNote && (
            <Badge variant="neutral" className="text-[9px]">
              <Sparkles className="h-2.5 w-2.5" /> {fitNote}
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-[var(--color-text-muted)]">
          {skuCount.toLocaleString()} items
          {!isOverridden && " · using the category default"}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <NumberField
          label="larger"
          value={increase}
          onChange={(next) => onChange({ increaseCm: next, decreaseCm: decrease })}
        />
        <NumberField
          label="smaller"
          value={decrease}
          onChange={(next) => onChange({ increaseCm: increase, decreaseCm: next })}
        />
        {isOverridden && (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <input
        type="number"
        min={0}
        max={MAX_TOLERANCE_CM}
        step={STEP_CM}
        value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
        className="w-16 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2 py-1 text-right font-mono text-xs text-[var(--color-text-primary)] focus:border-[var(--color-brand)] focus:outline-none"
      />
      <span className="text-[10px] text-[var(--color-text-muted)]">cm {label}</span>
    </label>
  );
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(MAX_TOLERANCE_CM, Math.max(0, value));
}

/** Slider steps are halves, so tolerances stay on the grid after a preset multiplies them. */
function round(value: number): number {
  return Math.round(value / STEP_CM) * STEP_CM;
}
