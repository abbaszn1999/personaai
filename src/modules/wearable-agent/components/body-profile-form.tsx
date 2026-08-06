"use client";

import * as React from "react";
import { Upload, User } from "lucide-react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import type { TryOnProfile } from "@/modules/wearable-agent/types";

interface BodyProfileFormProps {
  profile: TryOnProfile;
  onChange: (patch: Partial<TryOnProfile>) => void;
}

export function BodyProfileForm({ profile, onChange }: BodyProfileFormProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onChange({ photoUrl: url });

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      const photoBase64 = result?.includes(",") ? result.split(",")[1] : result;
      onChange({ photoBase64: photoBase64 ?? null, photoMimeType: file.type });
    };
    reader.readAsDataURL(file);

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
        <Input
          label="Shoe Size (EU)"
          type="number"
          placeholder="e.g. 42"
          value={profile.shoeSizeEu ?? ""}
          onChange={(e) => onChange({ shoeSizeEu: Number(e.target.value) || null })}
        />
      </div>
    </div>
  );
}
