"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { FormError, SettingsCard } from "@/components/ui/settings-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettingsProfile, type SettingsProfile } from "../context/settings-profile-context";

function initialsOf(firstName: string, lastName: string): string {
  return [firstName, lastName].filter(Boolean).map((part) => part[0]).join("").toUpperCase() || "?";
}

function ProfileForm({ profile }: { profile: SettingsProfile }) {
  const { updateLocal } = useSettingsProfile();
  const [firstName, setFirstName] = React.useState(profile.firstName ?? "");
  const [lastName, setLastName] = React.useState(profile.lastName ?? "");
  const [avatarUrl, setAvatarUrl] = React.useState(profile.profileImageUrl ?? "");
  const [imageFailed, setImageFailed] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const dirty =
    firstName !== (profile.firstName ?? "") ||
    lastName !== (profile.lastName ?? "") ||
    avatarUrl !== (profile.profileImageUrl ?? "");

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, profileImageUrl: avatarUrl }),
      });
      if (res.ok) {
        updateLocal({ firstName, lastName, profileImageUrl: avatarUrl || null });
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
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
      footer="Use a public image link (PNG or JPG)."
      action={
        <Button size="sm" loading={saving} disabled={!dirty && !saved} onClick={handleSave}>
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
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full gradient-brand">
          {avatarUrl && !imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="text-xl font-bold text-white">{initialsOf(firstName, lastName)}</span>
          )}
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
          <div className="sm:col-span-2">
            <Input
              label="Photo URL"
              type="url"
              value={avatarUrl}
              onChange={(event) => {
                setAvatarUrl(event.target.value);
                setImageFailed(false);
              }}
              placeholder="https://"
            />
          </div>
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
