"use client";

import * as React from "react";
import { AlertCircle, Loader2, ShieldCheck, Upload, User } from "lucide-react";
import Image from "next/image";
import type { TryOnProfile } from "@/modules/wearable-agent/types";
import { DEMO_FACE_URLS } from "@/modules/wearable-agent/constants";
import type { TryOnAudience } from "@/modules/wearable-agent/types";

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

/** Last onboarding step, not the first — a shopper who has already answered three easy
 *  questions is far likelier to finish uploading a photo than one asked for it cold. */
export function PhotoStep({ profile, error, onChange }: PhotoStepProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [loadingDemo, setLoadingDemo] = React.useState(false);

  // Departments without a face of their own (should one ever be missing) fall back to the unisex one.
  const demoAudience: TryOnAudience = profile.audience ?? "unisex";
  const demoPreviewUrl = DEMO_FACE_URLS[demoAudience];
  const usingDemoFace = Boolean(profile.photoUrl) && [...loadedDemoFaces.values()].includes(profile.photoUrl as string);
  const demoMatchesAudience = usingDemoFace && loadedDemoFaces.get(demoAudience) === profile.photoUrl;

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

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Add your photo</h2>
        <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
          A clear front-facing photo is all we need to build your avatar. Prefer not to share one? Use a demo face.
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
            {usingDemoFace ? "Demo face selected" : "Face photo ready"}
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

      {!demoMatchesAudience && (
        <>
          <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]" aria-hidden>
            <span className="h-px flex-1 bg-[var(--color-border)]" />
            or
            <span className="h-px flex-1 bg-[var(--color-border)]" />
          </div>
          <button
            type="button"
            onClick={() => void chooseDemoFace()}
            disabled={loadingDemo}
            className="flex items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border)] p-3 text-left transition-colors hover:border-[var(--color-violet-from)] hover:bg-[var(--color-accent-light)]/40 disabled:opacity-60"
          >
            <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface-base)]">
              <Image src={demoPreviewUrl} alt="" fill sizes="48px" className="object-cover object-top" unoptimized />
              {loadingDemo && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                </span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[var(--color-text-primary)]">Continue with a demo face</span>
              <span className="block text-xs text-[var(--color-text-muted)]">
                No photo needed — we build your avatar with a sample face instead.
              </span>
            </span>
          </button>
        </>
      )}
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-[var(--color-text-muted)]">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[var(--color-success)]" />
        {usingDemoFace
          ? "Your measurements still shape the body — only the face is a sample."
          : "Your photo is used to build your avatar, then discarded — never stored."}
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
