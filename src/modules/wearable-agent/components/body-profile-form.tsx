"use client";

import * as React from "react";
import { Upload, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { TryOnProfile } from "@/modules/wearable-agent/types";
import { BODY_SHAPE_LABELS } from "@/modules/wearable-agent/constants";
import type { BodyShape } from "@/modules/wearable-agent/types";
import { cn } from "@/lib/utils/cn";

interface BodyProfileFormProps {
  profile: TryOnProfile;
  onChange: (patch: Partial<TryOnProfile>) => void;
}

const BODY_SHAPES: BodyShape[] = ["rectangle", "hourglass", "pear", "apple", "inverted-triangle"];

export function BodyProfileForm({ profile, onChange }: BodyProfileFormProps) {
  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Your Profile</h3>

      {/* Photo upload placeholder */}
      <div
        className="flex flex-col items-center gap-2 rounded-[var(--radius-xl)] border-2 border-dashed border-[var(--color-border)] p-6 cursor-pointer hover:border-[var(--color-brand)] hover:bg-[var(--color-brand-light)] transition-colors"
        onClick={() => onChange({ photoUrl: "/mock-user-photo.jpg" })}
      >
        {profile.photoUrl ? (
          <div className="h-20 w-20 rounded-full gradient-brand flex items-center justify-center">
            <User className="h-10 w-10 text-white" />
          </div>
        ) : (
          <>
            <Upload className="h-6 w-6 text-[var(--color-text-muted)]" />
            <p className="text-sm text-[var(--color-text-muted)]">Upload your photo</p>
            <p className="text-xs text-[var(--color-text-muted)]">JPEG, PNG up to 10MB</p>
          </>
        )}
        {profile.photoUrl && (
          <p className="text-xs text-[var(--color-success)]">Photo ready ✓</p>
        )}
      </div>

      {/* Measurements */}
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Height (cm)"
          type="number"
          placeholder="e.g. 168"
          value={profile.heightCm ?? ""}
          onChange={(e) => onChange({ heightCm: Number(e.target.value) || null })}
        />
        <Input
          label="Weight (kg)"
          type="number"
          placeholder="e.g. 65"
          value={profile.weightKg ?? ""}
          onChange={(e) => onChange({ weightKg: Number(e.target.value) || null })}
        />
        <Input
          label="Chest (cm)"
          type="number"
          placeholder="e.g. 90"
          value={profile.chestCm ?? ""}
          onChange={(e) => onChange({ chestCm: Number(e.target.value) || null })}
        />
        <Input
          label="Waist (cm)"
          type="number"
          placeholder="e.g. 70"
          value={profile.waistCm ?? ""}
          onChange={(e) => onChange({ waistCm: Number(e.target.value) || null })}
        />
      </div>

      {/* Body Shape */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-[var(--color-text-secondary)]">Body Shape</span>
        <div className="flex flex-wrap gap-2">
          {BODY_SHAPES.map((shape) => (
            <button
              key={shape}
              onClick={() => onChange({ bodyShape: shape })}
              className={cn(
                "text-xs rounded-full px-3 py-1 border transition-all",
                profile.bodyShape === shape
                  ? "gradient-brand text-white border-transparent"
                  : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand)]"
              )}
            >
              {BODY_SHAPE_LABELS[shape]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
