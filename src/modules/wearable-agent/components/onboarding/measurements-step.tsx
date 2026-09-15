"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import type { TryOnProfile } from "@/modules/wearable-agent/types";

interface MeasurementsStepProps {
  profile: TryOnProfile;
  onChange: (patch: Partial<TryOnProfile>) => void;
}

/** Same five numeric fields as before (height/weight/chest/waist/shoe size, kept as raw
 *  measurements for the existing sizing pipeline) — just their own screen now, with
 *  touch-sized inputs so iOS doesn't auto-zoom on focus. */
export function MeasurementsStep({ profile, onChange }: MeasurementsStepProps) {
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
          placeholder="e.g. 168"
          value={profile.heightCm ?? ""}
          onChange={(e) => onChange({ heightCm: Number(e.target.value) || null })}
        />
        <Input
          inputSize="touch"
          label="Weight (kg)"
          type="number"
          inputMode="numeric"
          placeholder="e.g. 65"
          value={profile.weightKg ?? ""}
          onChange={(e) => onChange({ weightKg: Number(e.target.value) || null })}
        />
        <Input
          inputSize="touch"
          label="Chest (cm)"
          type="number"
          inputMode="numeric"
          placeholder="e.g. 90"
          value={profile.chestCm ?? ""}
          onChange={(e) => onChange({ chestCm: Number(e.target.value) || null })}
        />
        <Input
          inputSize="touch"
          label="Waist (cm)"
          type="number"
          inputMode="numeric"
          placeholder="e.g. 70"
          value={profile.waistCm ?? ""}
          onChange={(e) => onChange({ waistCm: Number(e.target.value) || null })}
        />
        <Input
          inputSize="touch"
          label="Shoe Size (EU)"
          type="number"
          inputMode="numeric"
          placeholder="e.g. 42"
          value={profile.shoeSizeEu ?? ""}
          onChange={(e) => onChange({ shoeSizeEu: Number(e.target.value) || null })}
        />
      </div>
    </div>
  );
}
