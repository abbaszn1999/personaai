"use client";

import * as React from "react";
import { User, Check, Mail, ImageIcon } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettingsProfile } from "../context/settings-profile-context";

function ProfileForm({ profile }: { profile: NonNullable<ReturnType<typeof useSettingsProfile>["profile"]> }) {
  const { updateLocal } = useSettingsProfile();
  const [firstName, setFirstName] = React.useState(profile.firstName ?? "");
  const [lastName, setLastName] = React.useState(profile.lastName ?? "");
  const [avatarUrl, setAvatarUrl] = React.useState(profile.profileImageUrl ?? "");
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
        const data = await res.json();
        setError(data.error ?? "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  }

  const initials = [firstName, lastName].filter(Boolean).map((s) => s[0]).join("").toUpperCase() || "?";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full shrink-0 overflow-hidden flex items-center justify-center gradient-brand shadow-[var(--shadow-card)]">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={initials} className="h-full w-full object-cover" onError={() => setAvatarUrl("")} />
          ) : (
            <span className="text-white font-bold text-xl">{initials}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <label className="text-sm font-medium text-[var(--color-text-secondary)] block mb-1.5">
            Profile photo URL
          </label>
          <div className="relative">
            <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              className="w-full h-9 pl-9 pr-3 text-sm bg-[var(--color-surface-card)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-brand)] focus:ring-1 focus:ring-[var(--color-brand)]"
            />
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Paste a public image URL. Displays in the sidebar and across the app.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" autoComplete="given-name" />
        <Input label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" autoComplete="family-name" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">Email address</label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
          <input
            type="email"
            value={profile.email}
            readOnly
            className="w-full h-9 pl-9 pr-3 text-sm bg-[var(--color-surface-card)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text-muted)] cursor-not-allowed opacity-70"
          />
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          {profile.provider === "google"
            ? "Email is managed by Google and cannot be changed here."
            : "Contact support to change your email address."}
        </p>
      </div>

      {error && (
        <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] rounded-[var(--radius-md)] px-3 py-2">{error}</p>
      )}

      <div className="flex justify-end pt-1">
        <Button size="sm" loading={saving} onClick={handleSave}>
          {saved && !saving ? <><Check className="h-3.5 w-3.5" /> Saved</> : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

export function GeneralSettings() {
  const { profile, loading } = useSettingsProfile();

  if (loading || !profile) {
    return (
      <SettingsSection title="Profile" description="Your name, avatar and email" icon={<User className="h-4 w-4" />} accent="brand">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-9 rounded-[var(--radius-md)] skeleton" />)}
        </div>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title="Profile" description="Your public name, avatar and contact information" icon={<User className="h-4 w-4" />} accent="brand">
      <ProfileForm key={profile.email} profile={profile} />
    </SettingsSection>
  );
}
