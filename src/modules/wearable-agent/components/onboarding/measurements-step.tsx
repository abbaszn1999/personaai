"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import type { TryOnProfile } from "@/modules/wearable-agent/types";
import { isKidsAudience, KIDS_AGE_RANGE } from "@/modules/wearable-agent/audiences";
import {
  applyHeightWeightEdit,
  NOTHING_AUTO_FILLED,
  type AutoFilled,
} from "@/modules/wearable-agent/utils/body-estimate";

interface MeasurementsStepProps {
  profile: TryOnProfile;
  onChange: (patch: Partial<TryOnProfile>) => void;
}

/** Height, weight and shoe size for everyone; then chest and waist for the adult departments, or
 *  age for the three kids departments (nobody measures a child's chest, and a child's size is set
 *  by height and age). Kept as raw measurements for the existing sizing pipeline — just their own
 *  screen, with touch-sized inputs so iOS doesn't auto-zoom on focus. */
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

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Your measurements</h2>
        <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
          Used to build a body-accurate avatar and size recommendations.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input
          inputSize="touch"
          label="Height (cm)"
          type="number"
          inputMode="numeric"
          placeholder={kids ? "e.g. 120" : "e.g. 168"}
          value={profile.heightCm ?? ""}
          onChange={(e) => editHeightWeight({ heightCm: Number(e.target.value) || null })}
        />
        <Input
          inputSize="touch"
          label="Weight (kg)"
          type="number"
          inputMode="numeric"
          placeholder={kids ? "e.g. 25" : "e.g. 65"}
          value={profile.weightKg ?? ""}
          onChange={(e) => editHeightWeight({ weightKg: Number(e.target.value) || null })}
        />
        {kids ? (
          <Input
            inputSize="touch"
            label="Age (years)"
            type="number"
            inputMode="numeric"
            min={KIDS_AGE_RANGE.min}
            max={KIDS_AGE_RANGE.max}
            placeholder="e.g. 6"
            value={profile.ageYears ?? ""}
            // Unlike the other fields, 0 is a real answer here (under one year old), so an empty
            // box is the only thing that clears it.
            onChange={(e) => {
              const raw = e.target.value.trim();
              const age = raw === "" ? null : Math.floor(Number(raw));
              onChange({ ageYears: age !== null && Number.isFinite(age) && age >= 0 ? age : null });
            }}
          />
        ) : (
          <>
            <Input
              inputSize="touch"
              label="Chest (cm)"
              type="number"
              inputMode="numeric"
              placeholder="e.g. 90"
              value={profile.chestCm ?? ""}
              onChange={(e) => editBodyField("chestCm", e.target.value)}
            />
            <Input
              inputSize="touch"
              label="Waist (cm)"
              type="number"
              inputMode="numeric"
              placeholder="e.g. 70"
              value={profile.waistCm ?? ""}
              onChange={(e) => editBodyField("waistCm", e.target.value)}
            />
            {(autoFilled.chestCm || autoFilled.waistCm) && (
              <p className="col-span-2 -mt-1 text-xs text-[var(--color-text-muted)]">
                Estimated from your height and weight — change{" "}
                {autoFilled.chestCm && autoFilled.waistCm ? "them" : "it"} if you know your exact{" "}
                {autoFilled.chestCm && autoFilled.waistCm ? "measurements" : autoFilled.chestCm ? "chest" : "waist"}.
              </p>
            )}
          </>
        )}
        <Input
          inputSize="touch"
          label="Shoe Size (EU)"
          type="number"
          inputMode="numeric"
          placeholder={kids ? "e.g. 32" : "e.g. 42"}
          value={profile.shoeSizeEu ?? ""}
          onChange={(e) => onChange({ shoeSizeEu: Number(e.target.value) || null })}
        />
      </div>
    </div>
  );
}
