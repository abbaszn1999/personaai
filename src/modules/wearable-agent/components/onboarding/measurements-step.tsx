"use client";

import * as React from "react";
import { Cake, Check, Footprints, MoveVertical, Ruler, Scale, Shirt, Sparkles } from "lucide-react";
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
  icon: React.ComponentType<{ className?: string }>;
  value: number | null;
  placeholder: string;
  onChange: (raw: string) => void;
  /** True while the number is the form's own estimate rather than something the shopper typed. */
  estimated?: boolean;
  /** Counts as filled even at 0 (a baby's age). */
  filledAtZero?: boolean;
  min?: number;
  max?: number;
  className?: string;
}

/**
 * One measurement: the label and a status mark on top, a large number below with its unit set
 * beside it. The whole tile is the label, so a tap anywhere focuses the number, and it lights up
 * in the brand colour while it is being edited. The number is 22px, which also keeps iOS from
 * zooming the page on focus (it only does so below 16px).
 */
function MeasureField({
  id,
  label,
  unit,
  icon: Icon,
  value,
  placeholder,
  onChange,
  estimated = false,
  filledAtZero = false,
  min,
  max,
  className,
}: MeasureFieldProps) {
  const filled = value !== null && (filledAtZero || value > 0);
  return (
    <label
      htmlFor={id}
      className={cn(
        "group flex cursor-text flex-col gap-1.5 rounded-[var(--radius-lg)] border bg-[var(--color-surface-card)] px-3.5 pb-3 pt-2.5",
        "shadow-[var(--shadow-card)] transition-all duration-200",
        "focus-within:border-[var(--color-brand)] focus-within:ring-4 focus-within:ring-[var(--color-brand-light)]",
        filled ? "border-[var(--color-border-strong)]" : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]",
        className
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)] transition-colors group-focus-within:text-[var(--color-brand-strong)]">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        {estimated ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-brand-light)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-brand-strong)]">
            <Sparkles className="h-2.5 w-2.5" />
            Estimated
          </span>
        ) : filled ? (
          <span
            aria-hidden
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-success)]/12 text-[var(--color-success)]"
          >
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        ) : null}
      </span>
      <span className="flex items-baseline gap-1.5">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          placeholder={placeholder}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-[22px] font-semibold leading-none tabular-nums text-[var(--color-text-primary)] outline-none",
            "placeholder:font-medium placeholder:text-[var(--color-text-muted)]/50",
            "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          )}
        />
        <span className="shrink-0 text-sm font-medium text-[var(--color-text-muted)]">{unit}</span>
      </span>
    </label>
  );
}

function isFilled(value: number | null, atZero = false): boolean {
  return value !== null && (atZero || value > 0);
}

/** Height, weight and shoe size for everyone; then chest and waist for the adult departments, or
 *  age for the three kids departments (nobody measures a child's chest, and a child's size is set
 *  by height and age). Kept as raw measurements for the existing sizing pipeline. */
export function MeasurementsStep({ profile, onChange }: MeasurementsStepProps) {
  const kids = isKidsAudience(profile.audience);
  // Which of chest/waist the form itself filled in from height and weight. Anything already on
  // the profile when this screen opens counts as the shopper's own and is never overwritten.
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

  // Typing in a field makes it the shopper's; clearing it hands it back to the estimate.
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
  const bothEstimated = autoFilled.chestCm && autoFilled.waistCm;

  return (
    <StepPanel
      icon={Ruler}
      title="Your measurements"
      description="Shapes a body-accurate avatar and your size recommendations."
      aside={
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold tabular-nums transition-colors",
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
      <div className="grid grid-cols-2 gap-3">
        <MeasureField
          id="onboarding-height"
          label="Height"
          unit="cm"
          icon={MoveVertical}
          placeholder={kids ? "120" : "168"}
          value={profile.heightCm}
          onChange={(raw) => editHeightWeight({ heightCm: Number(raw) || null })}
        />
        <MeasureField
          id="onboarding-weight"
          label="Weight"
          unit="kg"
          icon={Scale}
          placeholder={kids ? "25" : "65"}
          value={profile.weightKg}
          onChange={(raw) => editHeightWeight({ weightKg: Number(raw) || null })}
        />
        {kids ? (
          <MeasureField
            id="onboarding-age"
            label="Age"
            unit="yrs"
            icon={Cake}
            min={KIDS_AGE_RANGE.min}
            max={KIDS_AGE_RANGE.max}
            placeholder="6"
            filledAtZero
            value={profile.ageYears}
            // Unlike the other fields, 0 is a real answer here (under one year old), so an empty
            // box is the only thing that clears it.
            onChange={(raw) => {
              const trimmed = raw.trim();
              const age = trimmed === "" ? null : Math.floor(Number(trimmed));
              onChange({ ageYears: age !== null && Number.isFinite(age) && age >= 0 ? age : null });
            }}
          />
        ) : (
          <>
            <MeasureField
              id="onboarding-chest"
              label="Chest"
              unit="cm"
              icon={Shirt}
              placeholder="90"
              estimated={autoFilled.chestCm && isFilled(profile.chestCm)}
              value={profile.chestCm}
              onChange={(raw) => editBodyField("chestCm", raw)}
            />
            <MeasureField
              id="onboarding-waist"
              label="Waist"
              unit="cm"
              icon={Ruler}
              placeholder="70"
              estimated={autoFilled.waistCm && isFilled(profile.waistCm)}
              value={profile.waistCm}
              onChange={(raw) => editBodyField("waistCm", raw)}
            />
            {estimatedNote && (
              <p className="col-span-2 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-brand-light)] px-3 py-2 text-xs leading-snug text-[var(--color-text-secondary)] animate-fade-in">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-brand-strong)]" />
                <span>
                  Estimated from your height and weight. Change {bothEstimated ? "them" : "it"} if you know your exact{" "}
                  {bothEstimated ? "measurements" : autoFilled.chestCm ? "chest" : "waist"}.
                </span>
              </p>
            )}
          </>
        )}
        <MeasureField
          id="onboarding-shoe"
          label="Shoe size"
          unit="EU"
          icon={Footprints}
          placeholder={kids ? "32" : "42"}
          value={profile.shoeSizeEu}
          onChange={(raw) => onChange({ shoeSizeEu: Number(raw) || null })}
          className={kids ? undefined : "col-span-2"}
        />
      </div>

      <p className="mt-auto text-[11px] leading-snug text-[var(--color-text-muted)]">
        Only used to shape your avatar and recommend your size.
      </p>
    </StepPanel>
  );
}
