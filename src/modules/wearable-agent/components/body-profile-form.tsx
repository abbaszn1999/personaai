"use client";

import * as React from "react";
import { Upload, User } from "lucide-react";
import Image from "next/image";
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
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onChange({ photoUrl: url });
    e.target.value = "";
  }

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Your Profile</h3>

      <div
        role="button"
        tabIndex={0}
        className="flex flex-col items-center gap-2 rounded-[var(--radius-xl)] border-2 border-dashed border-[var(--color-border)] p-6 cursor-pointer hover:border-[var(--color-wearable-from)] hover:bg-[var(--color-accent-light)]/40 transition-colors"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
      >
        {profile.photoUrl ? (
          <div className="relative h-24 w-24 rounded-full overflow-hidden border-2 border-[var(--color-wearable-from)]">
            <Image
              src={profile.photoUrl}
              alt="Your face"
              fill
              className="object-cover"
              unoptimized
            />
          </div>
        ) : (
          <>
            <Upload className="h-6 w-6 text-[var(--color-text-muted)]" />
            <p className="text-sm font-medium text-[var(--color-text-secondary)]">Upload your face photo</p>
            <p className="text-xs text-[var(--color-text-muted)]">Clear front-facing photo · JPEG, PNG up to 10MB</p>
          </>
        )}
        {profile.photoUrl && (
          <p className="text-xs text-[var(--color-success)] flex items-center gap-1">
            <User className="h-3 w-3" />
            Face photo ready
          </p>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handlePhotoUpload}
      />

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

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-[var(--color-text-secondary)]">Body Shape</span>
        <div className="flex flex-wrap gap-2">
          {BODY_SHAPES.map((shape) => (
            <button
              key={shape}
              type="button"
              onClick={() => onChange({ bodyShape: shape })}
              className={cn(
                "text-xs rounded-full px-3 py-1.5 border transition-all",
                profile.bodyShape === shape
                  ? "gradient-wearable text-white border-transparent"
                  : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-wearable-from)]"
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
