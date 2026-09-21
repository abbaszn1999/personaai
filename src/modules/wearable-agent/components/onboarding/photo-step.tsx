"use client";

import * as React from "react";
import { AlertCircle, ShieldCheck, Upload, User } from "lucide-react";
import Image from "next/image";
import type { TryOnProfile } from "@/modules/wearable-agent/types";

interface PhotoStepProps {
  profile: TryOnProfile;
  error?: string | null;
  onChange: (patch: Partial<TryOnProfile>) => void;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

/** Last onboarding step, not the first — a shopper who has already answered three easy
 *  questions is far likelier to finish uploading a photo than one asked for it cold. */
export function PhotoStep({ profile, error, onChange }: PhotoStepProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const objectUrlRef = React.useRef<string | null>(null);

  React.useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    []
  );

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setLocalError(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setLocalError("Please upload a JPEG, PNG, or WEBP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError("That photo is too large — please use one under 10MB.");
      return;
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    onChange({ photoUrl: url });

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      const photoBase64 = result?.includes(",") ? result.split(",")[1] : result;
      onChange({ photoBase64: photoBase64 ?? null, photoMimeType: file.type });
    };
    reader.onerror = () => {
      setLocalError("Couldn't read that photo — please try a different file.");
      onChange({ photoUrl: null, photoBase64: null, photoMimeType: null });
    };
    reader.readAsDataURL(file);
  }

  function handleImgError() {
    setLocalError("That photo couldn't be loaded — please pick another one.");
    onChange({ photoUrl: null, photoBase64: null, photoMimeType: null });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Add your photo</h2>
        <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
          A clear front-facing photo is all we need to build your avatar.
        </p>
      </div>

      <div
        role="button"
        tabIndex={0}
        className="flex flex-col items-center gap-2 rounded-[var(--radius-xl)] border-2 border-dashed border-[var(--color-border)] p-8 cursor-pointer transition-colors hover:border-[var(--color-violet-from)] hover:bg-[var(--color-accent-light)]/40"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
      >
        {profile.photoUrl ? (
          <div className="relative h-28 w-28 overflow-hidden rounded-full border-2 border-[var(--color-violet-from)]">
            <Image
              src={profile.photoUrl}
              alt="Your face"
              fill
              sizes="112px"
              className="object-cover"
              unoptimized
              onError={handleImgError}
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
          <p className="flex items-center gap-1 text-xs text-[var(--color-success)]">
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

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-[var(--color-text-muted)]">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[var(--color-success)]" />
        Your photo is used to build your avatar, then discarded — never stored.
      </p>

      {(localError || error) && (
        <div className="flex items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-4 py-3 text-center text-sm text-[var(--color-error)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {localError || error}
        </div>
      )}
    </div>
  );
}
