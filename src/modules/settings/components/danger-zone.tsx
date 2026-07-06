"use client";

import * as React from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettingsProfile } from "../context/settings-profile-context";

export function DangerZone() {
  const { profile } = useSettingsProfile();
  const [confirming, setConfirming] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const provider = profile?.provider ?? "credentials";

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      const body = provider === "credentials" ? { password } : {};
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        window.location.href = "/sign-in";
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to delete account");
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SettingsSection
      title="Danger Zone"
      description="Irreversible actions — proceed with caution"
      icon={<AlertTriangle className="h-4 w-4" />}
      accent="danger"
    >
      <div className="rounded-[var(--radius-lg)] border border-[rgba(225,29,72,0.3)] bg-[var(--color-error-light)] px-4 py-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-[var(--color-error)]">Delete Account</p>
          <p className="text-xs text-[var(--color-error)] opacity-80 mt-0.5">
            Permanently deletes your account and all associated data. This cannot be undone.
          </p>
        </div>

        {!confirming ? (
          <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete My Account
          </Button>
        ) : (
          <div className="space-y-3">
            {provider === "credentials" && (
              <Input
                type="password"
                label="Confirm your password"
                placeholder="Enter your password to confirm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
            {provider === "google" && (
              <p className="text-xs text-[var(--color-error)]">
                Are you sure? This will permanently delete your account.
              </p>
            )}
            {error && (
              <p className="text-xs text-[var(--color-error)] font-medium">{error}</p>
            )}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setConfirming(false); setError(null); setPassword(""); }}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={deleting}
                onClick={handleDelete}
                disabled={provider === "credentials" && !password}
              >
                Yes, delete my account
              </Button>
            </div>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
