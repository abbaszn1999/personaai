"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, X } from "lucide-react";
import { FormError, SettingsCard } from "@/components/ui/settings-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettingsProfile, type SettingsProfile } from "../context/settings-profile-context";

function ProfileForm({ profile }: { profile: SettingsProfile }) {
  const { updateLocal } = useSettingsProfile();
  const router = useRouter();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = React.useState(profile.firstName ?? "");
  const [lastName, setLastName] = React.useState(profile.lastName ?? "");
  const [avatarUrl, setAvatarUrl] = React.useState(profile.profileImageUrl ?? "");
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [imageFailed, setImageFailed] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const dirty = firstName !== (profile.firstName ?? "") || lastName !== (profile.lastName ?? "");
  const shown = previewUrl || avatarUrl;
  const busy = uploading || removing;

  function clearPreview() {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  async function handleFile(file: File | undefined) {
    if (!file || busy) return;
    setError(null);
    setImageFailed(false);
    const local = URL.createObjectURL(file);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return local;
    });
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/account/avatar", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        clearPreview();
        setError(data.error ?? "Could not upload your photo.");
        return;
      }
      setAvatarUrl(data.profileImageUrl ?? "");
      updateLocal({ profileImageUrl: data.profileImageUrl ?? null });
      router.refresh();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRemove() {
    if (busy) return;
    setError(null);
    setRemoving(true);
    try {
      const res = await fetch("/api/account/avatar", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not remove your photo.");
        return;
      }
      clearPreview();
      setAvatarUrl("");
      setImageFailed(false);
      updateLocal({ profileImageUrl: null });
      router.refresh();
    } finally {
      setRemoving(false);
    }
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName }),
      });
      if (res.ok) {
        updateLocal({ firstName, lastName });
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save your profile.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      title="Profile"
      description="Your name and photo appear in the sidebar and on anything you share from the dashboard."
      footer="JPG, PNG, or WebP. Up to 2 MB."
      action={
        <Button size="sm" loading={saving} disabled={(!dirty && !saved) || busy} onClick={handleSave}>
          {saved && !saving ? (
            <>
              <Check className="h-3.5 w-3.5" /> Saved
            </>
          ) : (
            "Save"
          )}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative h-24 w-24 shrink-0">
          <button
            type="button"
            aria-label={shown && !imageFailed ? "Change photo" : "Upload photo"}
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface-base)] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] disabled:opacity-60"
          >
            {shown && !imageFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={shown}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <Plus className="h-6 w-6" strokeWidth={1.75} />
            )}
            {busy && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                <span className="h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
              </span>
            )}
          </button>
          {shown && !imageFailed && (
            <button
              type="button"
              aria-label="Remove photo"
              disabled={busy}
              onClick={handleRemove}
              className="absolute right-0 top-0 z-10 flex h-6 w-6 translate-x-0.5 -translate-y-0.5 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-card)] text-[var(--color-text-secondary)] shadow-sm transition-colors hover:text-[var(--color-error)] disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.25} />
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
            }}
          />
        </div>
        <div className="grid flex-1 gap-4 sm:grid-cols-2">
          <Input
            label="First name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            autoComplete="given-name"
          />
          <Input
            label="Last name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            autoComplete="family-name"
          />
        </div>
      </div>
      {error && <FormError>{error}</FormError>}
    </SettingsCard>
  );
}

export function ProfileCard() {
  const { profile, loading } = useSettingsProfile();
  if (loading || !profile) {
    return <div className="card-base h-64 animate-pulse" />;
  }
  return <ProfileForm key={profile.email} profile={profile} />;
}
