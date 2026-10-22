"use client";

import * as React from "react";
import {
  AlertCircle,
  Camera,
  Check,
  Loader2,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils/cn";
import type { TryOnProfile, TryOnAudience } from "@/modules/wearable-agent/types";
import { DEMO_FACE_URLS } from "@/modules/wearable-agent/constants";
import { StepPanel } from "./step-panel";

interface PhotoStepProps {
  profile: TryOnProfile;
  error?: string | null;
  onChange: (patch: Partial<TryOnProfile>) => void;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

/** The data URLs of the demo faces used so far in this page's life, by department. Lets the step
 *  tell a demo face from an uploaded photo after it is re-opened (going back and forward). */
const loadedDemoFaces = new Map<TryOnAudience, string>();

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("unreadable")));
    reader.onerror = () => reject(reader.error ?? new Error("unreadable"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Compact side-by-side circular face selector:
 * - Left option: Circular upload button (shows the uploaded selfie inside the circle once picked).
 * - Right option (on the same horizontal row): Circular sample/demo face button for one-tap try-on.
 */
export function PhotoStep({ profile, error, onChange }: PhotoStepProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [loadingDemo, setLoadingDemo] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

  const demoAudience: TryOnAudience = profile.audience ?? "unisex";
  const demoPreviewUrl = DEMO_FACE_URLS[demoAudience];
  const usingDemoFace = Boolean(profile.photoUrl) && [...loadedDemoFaces.values()].includes(profile.photoUrl as string);
  const demoMatchesAudience = usingDemoFace && loadedDemoFaces.get(demoAudience) === profile.photoUrl;
  const hasPhoto = Boolean(profile.photoUrl);
  const hasCustomPhoto = hasPhoto && !usingDemoFace;

  function processFile(file: File | undefined) {
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

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      const photoBase64 = result?.includes(",") ? result.split(",")[1] : result;
      onChange({
        photoUrl: result,
        photoBase64: photoBase64 ?? null,
        photoMimeType: file.type,
      });
    };
    reader.onerror = () => {
      setLocalError("Couldn't read that photo — please try a different file.");
      onChange({ photoUrl: null, photoBase64: null, photoMimeType: null });
    };
    reader.readAsDataURL(file);
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    processFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    setDragging(false);
    processFile(e.dataTransfer.files?.[0]);
  }

  function clearPhoto(e: React.MouseEvent) {
    e.stopPropagation();
    setLocalError(null);
    onChange({ photoUrl: null, photoBase64: null, photoMimeType: null });
  }

  async function chooseDemoFace() {
    if (loadingDemo) return;
    setLocalError(null);
    setLoadingDemo(true);
    try {
      const res = await fetch(DEMO_FACE_URLS[demoAudience]);
      if (!res.ok) throw new Error(`demo face ${res.status}`);
      const blob = await res.blob();
      const dataUrl = await readAsDataUrl(blob);
      loadedDemoFaces.set(demoAudience, dataUrl);
      onChange({
        photoUrl: dataUrl,
        photoBase64: dataUrl.split(",")[1] ?? null,
        photoMimeType: blob.type || "image/jpeg",
      });
    } catch {
      setLocalError("Couldn't load the demo face — please try again, or upload a photo.");
    } finally {
      setLoadingDemo(false);
    }
  }

  function handleImgError() {
    setLocalError("That photo couldn't be loaded — please pick another one.");
    onChange({ photoUrl: null, photoBase64: null, photoMimeType: null });
  }

  const openPicker = () => fileInputRef.current?.click();

  return (
    <StepPanel
      icon={Camera}
      title="Face photo"
      description="Upload a front-facing selfie or use our sample face"
      aside={
        hasPhoto ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-success)]/12 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-success)]">
            <Check className="h-3 w-3" strokeWidth={3} />
            {usingDemoFace ? "Sample ready" : "Photo ready"}
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">
            Choose 1
          </span>
        )
      }
    >
      {/* Two circular options side-by-side on the exact same line */}
      <div className="grid grid-cols-2 gap-2.5 @md:gap-3">
        {/* Option 1: Circular Upload Selfie */}
        <div
          role="button"
          tabIndex={0}
          aria-label={hasCustomPhoto ? "Change your uploaded photo" : "Upload your photo"}
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openPicker();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!dragging) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "group relative flex cursor-pointer select-none items-center gap-2.5 rounded-[var(--radius-lg)] border bg-[var(--color-surface-card)] p-2.5 text-left transition-all duration-200 @md:gap-3 @md:p-3",
            "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--color-brand-light)]",
            hasCustomPhoto
              ? "border-[var(--color-brand)] shadow-[var(--shadow-elevated)] ring-2 ring-[var(--color-brand-light)]"
              : dragging
                ? "border-dashed border-[var(--color-brand)] bg-[var(--color-brand-light)]/50"
                : "border-[var(--color-border)] shadow-[var(--shadow-card)] hover:border-[var(--color-brand)]"
          )}
        >
          {/* Circular avatar / upload target */}
          <span
            className={cn(
              "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-105 @md:h-14 @md:w-14",
              hasCustomPhoto
                ? "ring-2 ring-[var(--color-brand)] ring-offset-2 ring-offset-[var(--color-surface-card)]"
                : "border-2 border-dashed border-[var(--color-brand)]/50 bg-[var(--color-brand-light)]/60 text-[var(--color-brand-strong)]"
            )}
          >
            {hasCustomPhoto ? (
              <>
                <span className="relative h-full w-full overflow-hidden rounded-full">
                  <Image
                    src={profile.photoUrl as string}
                    alt="Your face"
                    fill
                    sizes="56px"
                    className="object-cover object-top"
                    unoptimized
                    onError={handleImgError}
                  />
                </span>
                <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-success)] text-white shadow-sm ring-2 ring-[var(--color-surface-card)]">
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
              </>
            ) : (
              <Upload className="h-4 w-4 @md:h-5 @md:w-5" />
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-[var(--color-text-primary)] @md:text-[13px]">
              {hasCustomPhoto ? "Your selfie" : dragging ? "Drop photo" : "Upload photo"}
            </span>
            <span className="mt-0.5 block truncate text-[11px] leading-tight text-[var(--color-text-muted)]">
              {hasCustomPhoto ? "Tap to replace" : "Clear front selfie"}
            </span>
          </span>

          {hasCustomPhoto && (
            <button
              type="button"
              aria-label="Remove uploaded photo"
              onClick={clearPhoto}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-base)] hover:text-[var(--color-text-primary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Option 2 (same line): Circular Sample / Demo Face */}
        <button
          type="button"
          onClick={() => void chooseDemoFace()}
          disabled={loadingDemo}
          className={cn(
            "group relative flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-lg)] border bg-[var(--color-surface-card)] p-2.5 text-left transition-all duration-200 @md:gap-3 @md:p-3",
            "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--color-brand-light)] disabled:opacity-60",
            demoMatchesAudience
              ? "border-[var(--color-brand)] shadow-[var(--shadow-elevated)] ring-2 ring-[var(--color-brand-light)]"
              : "border-[var(--color-border)] shadow-[var(--shadow-card)] hover:border-[var(--color-brand)]"
          )}
        >
          <span
            className={cn(
              "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-base)] transition-transform duration-200 group-hover:scale-105 @md:h-14 @md:w-14",
              demoMatchesAudience
                ? "ring-2 ring-[var(--color-brand)] ring-offset-2 ring-offset-[var(--color-surface-card)]"
                : "border border-[var(--color-border-strong)]"
            )}
          >
            <span className="relative h-full w-full overflow-hidden rounded-full">
              <Image
                src={demoPreviewUrl}
                alt="Sample face"
                fill
                sizes="56px"
                className="object-cover object-top"
                unoptimized
              />
              {loadingDemo && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                </span>
              )}
            </span>
            {demoMatchesAudience && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-success)] text-white shadow-sm ring-2 ring-[var(--color-surface-card)]">
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-[var(--color-text-primary)] @md:text-[13px]">
              Sample face
            </span>
            <span className="mt-0.5 block truncate text-[11px] leading-tight text-[var(--color-text-muted)]">
              {demoMatchesAudience ? "Selected · Ready" : "No photo needed"}
            </span>
          </span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handlePhotoUpload}
      />

      <p className="flex items-center gap-1.5 text-[11px] leading-snug text-[var(--color-text-muted)]">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[var(--color-success)]" />
        <span className="truncate">
          {usingDemoFace
            ? "Your measurements still shape the body — only the face is a sample."
            : "Photos are used once to generate your avatar and never stored."}
        </span>
      </p>

      {(localError || error) && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-3 py-2 text-xs text-[var(--color-error)]"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {localError || error}
        </div>
      )}
    </StepPanel>
  );
}
