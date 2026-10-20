"use client";

import * as React from "react";
import {
  AlertCircle,
  Camera,
  Check,
  ChevronRight,
  Glasses,
  Loader2,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils/cn";
import type { TryOnProfile } from "@/modules/wearable-agent/types";
import { DEMO_FACE_URLS } from "@/modules/wearable-agent/constants";
import type { TryOnAudience } from "@/modules/wearable-agent/types";
import { StepPanel } from "./step-panel";

interface PhotoStepProps {
  profile: TryOnProfile;
  error?: string | null;
  onChange: (patch: Partial<TryOnProfile>) => void;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

const PHOTO_TIPS = [
  { icon: ScanFace, label: "Face the camera" },
  { icon: Sun, label: "Good lighting" },
  { icon: Glasses, label: "No sunglasses" },
] as const;

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

/** Corner marks of a camera viewfinder, drawn in the brand colour. */
function ViewfinderCorners({ className }: { className?: string }) {
  const corner = "absolute h-5 w-5 border-[var(--color-brand)]";
  return (
    <span aria-hidden className={cn("pointer-events-none absolute inset-3", className)}>
      <span className={cn(corner, "left-0 top-0 rounded-tl-lg border-l-2 border-t-2")} />
      <span className={cn(corner, "right-0 top-0 rounded-tr-lg border-r-2 border-t-2")} />
      <span className={cn(corner, "bottom-0 left-0 rounded-bl-lg border-b-2 border-l-2")} />
      <span className={cn(corner, "bottom-0 right-0 rounded-br-lg border-b-2 border-r-2")} />
    </span>
  );
}

/** Last onboarding step, not the first — a shopper who has already answered three easy
 *  questions is far likelier to finish uploading a photo than one asked for it cold. */
export function PhotoStep({ profile, error, onChange }: PhotoStepProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [loadingDemo, setLoadingDemo] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

  // Departments without a face of their own (should one ever be missing) fall back to the unisex one.
  const demoAudience: TryOnAudience = profile.audience ?? "unisex";
  const demoPreviewUrl = DEMO_FACE_URLS[demoAudience];
  const usingDemoFace = Boolean(profile.photoUrl) && [...loadedDemoFaces.values()].includes(profile.photoUrl as string);
  const demoMatchesAudience = usingDemoFace && loadedDemoFaces.get(demoAudience) === profile.photoUrl;
  const hasPhoto = Boolean(profile.photoUrl);

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

    // Keep one data URL for both the preview and the later chat avatar. A blob URL belongs to
    // this component; revoking it when onboarding unmounted used to leave profile.photoUrl
    // pointing at a dead resource, which rendered as a broken image beside every user message.
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

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    processFile(e.dataTransfer.files?.[0]);
  }

  function clearPhoto() {
    setLocalError(null);
    onChange({ photoUrl: null, photoBase64: null, photoMimeType: null });
  }

  /** Picks the department's demo face: it goes through the same photo fields an upload fills, so
   *  avatar generation cannot tell the difference. */
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
      title="Your photo"
      description="A clear, front-facing photo is all we need to build your face."
      aside={
        hasPhoto ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-success)]/12 px-2 py-1 text-[11px] font-semibold text-[var(--color-success)] animate-scale-in">
            <Check className="h-3 w-3" strokeWidth={3} />
            Ready
          </span>
        ) : null
      }
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={hasPhoto ? "Change your photo" : "Upload your photo"}
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
          "group relative isolate flex w-full cursor-pointer select-none items-center justify-center overflow-hidden @lg:aspect-[4/3]",
          // Stacked (phone): portrait once a face is in it, since a wide crop cuts the chin and
          // puts the Change / remove bar over the face. Side by side (desktop) the frame stays
          // landscape so the screen is not as tall as it is wide; the crop is nudged down to
          // keep the whole face in it.
          hasPhoto ? "aspect-[4/5]" : "aspect-[5/4]",
          "rounded-[var(--radius-xl)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-brand-light)]",
          hasPhoto
            ? "border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)]"
            : dragging
              ? "border-2 border-dashed border-[var(--color-brand)] bg-[var(--color-brand-light)]"
              : "border-2 border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-card)] hover:border-[var(--color-brand)] hover:bg-[var(--color-brand-light)]/40"
        )}
      >
        {hasPhoto ? (
          <>
            <Image
              src={profile.photoUrl as string}
              alt="Your face"
              fill
              sizes="(min-width: 512px) 300px, 90vw"
              className="object-cover object-top transition-transform @lg:object-[50%_32%] duration-500 group-hover:scale-[1.03]"
              unoptimized
              onError={handleImgError}
            />
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/70 via-black/25 to-transparent"
            />
            <span className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-between gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-black/45 py-1 pl-1 pr-3 text-xs font-semibold text-white backdrop-blur">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-success)] text-white">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                <span className="truncate">{usingDemoFace ? "Sample face" : "Photo ready"}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/90 px-3 text-xs font-semibold text-[#17121d] shadow-md backdrop-blur transition-colors group-hover:bg-white">
                  <RefreshCw className="h-3 w-3" />
                  Change
                </span>
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearPhoto();
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/65"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            </span>
          </>
        ) : (
          <>
            <ViewfinderCorners className="opacity-60 transition-opacity group-hover:opacity-100" />
            <div className="flex flex-col items-center gap-3 px-4 text-center">
              <span className="relative flex h-16 w-16 items-center justify-center">
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-[var(--color-brand-light)] transition-transform duration-300 group-hover:scale-110"
                />
                <span aria-hidden className="absolute -inset-1.5 rounded-full border border-[var(--color-brand)]/25" />
                <ScanFace className="relative h-7 w-7 text-[var(--color-brand-strong)]" strokeWidth={1.75} />
              </span>
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {dragging ? "Drop to upload" : "Upload a selfie"}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                  <span className="hidden @md:inline">Drag &amp; drop, or </span>
                  <span className="@md:hidden">Tap to </span>
                  <span className="hidden font-medium text-[var(--color-brand-strong)] @md:inline">browse</span>
                  <span className="font-medium text-[var(--color-brand-strong)] @md:hidden">choose a photo</span>
                </p>
              </div>
              <p className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2.5 py-1 text-[10px] font-medium tracking-wide text-[var(--color-text-muted)]">
                JPEG · PNG · WebP · up to 10 MB
              </p>
            </div>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handlePhotoUpload}
      />

      {!hasPhoto && (
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
          {PHOTO_TIPS.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-muted)]">
              <Icon className="h-3.5 w-3.5 text-[var(--color-brand-strong)]" />
              {label}
            </li>
          ))}
        </ul>
      )}

      {!demoMatchesAudience && (
        <button
          type="button"
          onClick={() => void chooseDemoFace()}
          disabled={loadingDemo}
          className={cn(
            "group/demo flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-2.5 text-left",
            "shadow-[var(--shadow-card)] transition-all hover:border-[var(--color-brand)] hover:shadow-[var(--shadow-elevated)] disabled:opacity-60"
          )}
        >
          <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface-base)]">
            <Image src={demoPreviewUrl} alt="" fill sizes="48px" className="object-cover object-top" unoptimized />
            {loadingDemo && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[var(--color-text-primary)]">No photo handy?</span>
            <span className="block text-xs leading-snug text-[var(--color-text-muted)]">
              Continue with a sample face instead.
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-text-muted)] transition-transform group-hover/demo:translate-x-0.5 group-hover/demo:text-[var(--color-brand-strong)]" />
        </button>
      )}

      <p className="mt-auto flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-success)]/12 px-3 py-2 text-[11px] leading-snug text-[var(--color-text-secondary)]">
        <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--color-success)]" />
        {usingDemoFace
          ? "Your measurements still shape the body — only the face is a sample."
          : "Your photo is used to build your avatar, then discarded — never stored."}
      </p>

      {(localError || error) && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-3.5 py-3 text-sm text-[var(--color-error)]"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {localError || error}
        </div>
      )}
    </StepPanel>
  );
}
