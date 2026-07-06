"use client";

import * as React from "react";
import { Link2, Check } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettingsProfile } from "../context/settings-profile-context";

export function ConnectedAccounts() {
  const { profile, loading, updateLocal } = useSettingsProfile();

  const [newPass, setNewPass] = React.useState("");
  const [confirmPass, setConfirmPass] = React.useState("");
  const [settingPass, setSettingPass] = React.useState(false);
  const [passSet, setPassSet] = React.useState(false);
  const [passError, setPassError] = React.useState<string | null>(null);

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setPassError(null);
    if (newPass !== confirmPass) { setPassError("Passwords do not match"); return; }
    if (newPass.length < 8) { setPassError("Password must be at least 8 characters"); return; }
    setSettingPass(true);
    try {
      const res = await fetch("/api/account/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPass }),
      });
      const data = await res.json();
      if (res.ok) {
        setPassSet(true);
        setNewPass(""); setConfirmPass("");
        updateLocal({ hasPassword: true });
      } else {
        setPassError(data.error ?? "Failed to set password");
      }
    } finally { setSettingPass(false); }
  }

  if (loading) {
    return (
      <SettingsSection title="Connected Accounts" description="Sign-in methods" icon={<Link2 className="h-4 w-4" />} accent="brand">
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-14 rounded-[var(--radius-lg)] skeleton" />)}
        </div>
      </SettingsSection>
    );
  }

  const googleConnected = !!profile?.googleId;
  const hasPassword = !!profile?.hasPassword;

  return (
    <SettingsSection title="Connected Accounts" description="Sign-in methods linked to your account" icon={<Link2 className="h-4 w-4" />} accent="brand">
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-4 py-3">
          <div className="h-9 w-9 rounded-full border border-[var(--color-border)] bg-white flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">Google</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {googleConnected ? profile?.email : "Not connected"}
            </p>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
            googleConnected
              ? "bg-[var(--color-success-light)] text-[var(--color-success)]"
              : "bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]"
          }`}>
            {googleConnected ? "CONNECTED" : "NOT CONNECTED"}
          </span>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-[var(--radius-md)] bg-[var(--color-surface-elevated)] flex items-center justify-center shrink-0">
              <svg className="h-4 w-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">Email & Password</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {hasPassword ? "Password is set" : "No password — Google sign-in only"}
              </p>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
              hasPassword
                ? "bg-[var(--color-success-light)] text-[var(--color-success)]"
                : "bg-[var(--color-warning-light)] text-[var(--color-warning)]"
            }`}>
              {hasPassword ? "SET" : "NOT SET"}
            </span>
          </div>

          {!hasPassword && (
            <form onSubmit={handleSetPassword} className="space-y-3 pt-1 border-t border-[var(--color-border)]">
              <p className="text-xs text-[var(--color-text-muted)]">
                Add a password to enable email sign-in alongside Google.
              </p>
              {passSet ? (
                <div className="flex items-center gap-2 text-[var(--color-success)] text-sm font-medium">
                  <Check className="h-4 w-4" /> Password set successfully!
                </div>
              ) : (
                <>
                  <Input label="New password" type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="Min. 8 characters" />
                  <Input label="Confirm password" type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} required autoComplete="new-password" placeholder="Repeat password" />
                  {passError && <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] rounded-[var(--radius-md)] px-3 py-2">{passError}</p>}
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" loading={settingPass}>Set Password</Button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}
