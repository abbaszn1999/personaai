"use client";

import * as React from "react";
import { Check, Ruler, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { TryOnProfile } from "@/modules/wearable-agent/types";
import { isKidsAudience, KIDS_AGE_RANGE } from "@/modules/wearable-agent/audiences";
import {
  applyHeightWeightEdit,
  NOTHING_AUTO_FILLED,
  type AutoFilled,
} from "@/modules/wearable-agent/utils/body-estimate";
import { StepPanel } from "./step-panel";

interface MeasurementsStepProps {
  profile: TryOnProfile;
  onChange: (patch: Partial<TryOnProfile>) => void;
}

interface MeasureFieldProps {
  id: string;
  label: string;
  unit: string;
  value: number | null;
  placeholder: string;
  onChange: (raw: string) => void;
  /** True while the number is the form's own estimate rather than something the shopper typed. */
  estimated?: boolean;
  /** Counts as filled even at 0 (a baby's age). */
  filledAtZero?: boolean;
  min?: number;
  max?: number;
  /** Realistic finished range. Once the typed number cannot take another digit inside this
   *  range, focus moves to `nextFieldId`. */
  completeRange?: { min: number; max: number };
  nextFieldId?: string;
  className?: string;
}

/** A measurement entry is finished when it sits inside the range and another digit would push
 *  it past the maximum (so 90cm chest moves on, while 15 still waits in case it becomes 150).
 *  A number that already uses every digit the maximum needs (180cm, shoe 42) is finished too. */
export function entryReadyToAdvance(raw: string, min: number, max: number): boolean {
  if (!/^\d+$/.test(raw)) return false;
  const value = Number(raw);
  if (value < min || value > max) return false;
  const maxDigits = String(Math.floor(max)).length;
  if (raw.length >= maxDigits) return true;
  return value * 10 > max;
}

function focusMeasurementField(id: string) {
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (el instanceof HTMLInputElement) el.focus();
  });
}

/**
 * Soft, compact measurement tile: a clean medium-weight label and status indicator on top,
 * and a 17px–18px tabular number with its unit beside it below (kept >=16px so iOS Safari
 * never auto-zooms the viewport on focus).
 */
function MeasureField({
  id,
  label,
  unit,
  value,
  placeholder,
  onChange,
  estimated = false,
  filledAtZero = false,
  min,
  max,
  completeRange,
  nextFieldId,
  className,
}: MeasureFieldProps) {
  const filled = value !== null && (filledAtZero || value > 0);
  const typedLength = React.useRef(String(value ?? "").length);

  React.useEffect(() => {
    typedLength.current = String(value ?? "").length;
  }, [value]);

  function handleInput(raw: string) {
    const previousLength = typedLength.current;
    typedLength.current = raw.length;
    onChange(raw);
    if (
      raw.length > previousLength &&
      nextFieldId &&
      completeRange &&
      entryReadyToAdvance(raw, completeRange.min, completeRange.max)
    ) {
      focusMeasurementField(nextFieldId);
    }
  }

  return (
    <label
      htmlFor={id}
      className={cn(
        "group flex cursor-text flex-col gap-1 rounded-[var(--radius-lg)] border bg-[var(--color-surface-card)] px-3 py-2",
        "shadow-[var(--shadow-card)] transition-all duration-150",
        "focus-within:border-[var(--color-brand)] focus-within:ring-3 focus-within:ring-[var(--color-brand-light)]",
        filled
          ? "border-[var(--color-border-strong)]"
          : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]",
        className
      )}
    >
      <span className="flex items-center justify-between gap-1.5">
        <span className="truncate text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors group-focus-within:text-[var(--color-brand-strong)]">
          {label}
        </span>
        {estimated ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--color-brand-light)] px-1.5 py-px text-[9px] font-semibold text-[var(--color-brand-strong)]">
            <Sparkles className="h-2.5 w-2.5" />
            Est.
          </span>
        ) : filled ? (
          <span
            aria-hidden
            className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[var(--color-success)]/15 text-[var(--color-success)]"
          >
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        ) : null}
      </span>
      <span className="flex items-baseline gap-1">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          placeholder={placeholder}
          value={value ?? ""}
          onChange={(e) => handleInput(e.target.value)}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-[17px] font-semibold leading-tight tracking-tight tabular-nums text-[var(--color-text-primary)] outline-none @md:text-[18px]",
            "placeholder:font-normal placeholder:text-[var(--color-text-muted)]/45",
            "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          )}
        />
        <span className="shrink-0 text-xs font-medium text-[var(--color-text-muted)]">{unit}</span>
      </span>
    </label>
  );
}

function isFilled(value: number | null, atZero = false): boolean {
  return value !== null && (atZero || value > 0);
}

/**
 * Compact 2-row measurement grid:
 * - Adults: Row 1 has Height + Weight (2 cols); Row 2 has Chest + Waist + Shoe (3 cols).
 * - Kids: 2×2 grid of Height, Weight, Age, and Shoe.
 */
export function MeasurementsStep({ profile, onChange }: MeasurementsStepProps) {
  const kids = isKidsAudience(profile.audience);
  const [autoFilled, setAutoFilled] = React.useState<AutoFilled>(NOTHING_AUTO_FILLED);

  function editHeightWeight(edit: { heightCm?: number | null; weightKg?: number | null }) {
    if (kids) {
      onChange(edit);
      return;
    }
    const result = applyHeightWeightEdit(profile, edit, autoFilled);
    setAutoFilled(result.autoFilled);
    onChange(result.patch);
  }

  function editBodyField(field: "chestCm" | "waistCm", raw: string) {
    const value = Number(raw) || null;
    setAutoFilled((current) => ({ ...current, [field]: false }));
    onChange({ [field]: value });
  }

  const answers = kids
    ? [isFilled(profile.heightCm), isFilled(profile.weightKg), isFilled(profile.ageYears, true), isFilled(profile.shoeSizeEu)]
    : [
        isFilled(profile.heightCm),
        isFilled(profile.weightKg),
        isFilled(profile.chestCm),
        isFilled(profile.waistCm),
        isFilled(profile.shoeSizeEu),
      ];
  const done = answers.filter(Boolean).length;
  const allDone = done === answers.length;

  const estimatedNote = autoFilled.chestCm || autoFilled.waistCm;

  return (
    <StepPanel
      icon={Ruler}
      title="Measurements"
      description="Shapes your body proportions and size recommendations"
      aside={
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums transition-colors",
            allDone
              ? "border-transparent bg-[var(--color-success)]/12 text-[var(--color-success)]"
              : "border-[var(--color-border)] bg-[var(--color-surface-card)] text-[var(--color-text-muted)]"
          )}
          aria-label={`${done} of ${answers.length} answered`}
        >
          {allDone && <Check className="h-3 w-3" strokeWidth={3} />}
          {done}/{answers.length}
        </span>
      }
    >
      {kids ? (
        <div className="grid grid-cols-2 gap-2 @md:gap-2.5">
          <MeasureField
            id="onboarding-height"
            label="Height"
            unit="cm"
            placeholder="120"
            completeRange={{ min: 40, max: 200 }}
            nextFieldId="onboarding-weight"
            value={profile.heightCm}
            onChange={(raw) => editHeightWeight({ heightCm: Number(raw) || null })}
          />
          <MeasureField
            id="onboarding-weight"
            label="Weight"
            unit="kg"
            placeholder="25"
            completeRange={{ min: 2, max: 120 }}
            nextFieldId="onboarding-age"
            value={profile.weightKg}
            onChange={(raw) => editHeightWeight({ weightKg: Number(raw) || null })}
          />
          <MeasureField
            id="onboarding-age"
            label="Age"
            unit="yrs"
            min={KIDS_AGE_RANGE.min}
            max={KIDS_AGE_RANGE.max}
            placeholder="6"
            filledAtZero
            completeRange={KIDS_AGE_RANGE}
            nextFieldId="onboarding-shoe"
            value={profile.ageYears}
            onChange={(raw) => {
              const trimmed = raw.trim();
              const age = trimmed === "" ? null : Math.floor(Number(trimmed));
              onChange({ ageYears: age !== null && Number.isFinite(age) && age >= 0 ? age : null });
            }}
          />
          <MeasureField
            id="onboarding-shoe"
            label="Shoe size"
            unit="EU"
            placeholder="32"
            completeRange={{ min: 16, max: 40 }}
            value={profile.shoeSizeEu}
            onChange={(raw) => onChange({ shoeSizeEu: Number(raw) || null })}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2 @md:gap-2.5">
          {/* Row 1: Primary measurements (Height & Weight) */}
          <div className="grid grid-cols-2 gap-2 @md:gap-2.5">
            <MeasureField
              id="onboarding-height"
              label="Height"
              unit="cm"
              placeholder="168"
              completeRange={{ min: 120, max: 220 }}
              nextFieldId="onboarding-weight"
              value={profile.heightCm}
              onChange={(raw) => editHeightWeight({ heightCm: Number(raw) || null })}
            />
            <MeasureField
              id="onboarding-weight"
              label="Weight"
              unit="kg"
              placeholder="65"
              completeRange={{ min: 30, max: 180 }}
              nextFieldId={profile.heightCm != null && profile.heightCm >= 120 ? "onboarding-shoe" : "onboarding-chest"}
              value={profile.weightKg}
              onChange={(raw) => editHeightWeight({ weightKg: Number(raw) || null })}
            />
          </div>
          {/* Row 2: Secondary measurements (Chest, Waist & Shoe size in 3 balanced columns) */}
          <div className="grid grid-cols-3 gap-2 @md:gap-2.5">
            <MeasureField
              id="onboarding-chest"
              label="Chest"
              unit="cm"
              placeholder="90"
              estimated={autoFilled.chestCm && isFilled(profile.chestCm)}
              completeRange={{ min: 60, max: 160 }}
              nextFieldId="onboarding-waist"
              value={profile.chestCm}
              onChange={(raw) => editBodyField("chestCm", raw)}
            />
            <MeasureField
              id="onboarding-waist"
              label="Waist"
              unit="cm"
              placeholder="70"
              estimated={autoFilled.waistCm && isFilled(profile.waistCm)}
              completeRange={{ min: 50, max: 150 }}
              nextFieldId="onboarding-shoe"
              value={profile.waistCm}
              onChange={(raw) => editBodyField("waistCm", raw)}
            />
            <MeasureField
              id="onboarding-shoe"
              label="Shoe"
              unit="EU"
              placeholder="42"
              completeRange={{ min: 20, max: 52 }}
              value={profile.shoeSizeEu}
              onChange={(raw) => onChange({ shoeSizeEu: Number(raw) || null })}
            />
          </div>
        </div>
      )}

      {estimatedNote && (
        <p className="flex items-center gap-1.5 text-[11px] leading-snug text-[var(--color-text-muted)] animate-fade-in">
          <Sparkles className="h-3 w-3 shrink-0 text-[var(--color-brand-strong)]" />
          <span className="truncate">
            Chest &amp; waist auto-estimated from height and weight — tap either to adjust.
          </span>
        </p>
      )}
    </StepPanel>
  );
}
