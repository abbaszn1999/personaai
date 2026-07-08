"use client";

import * as React from "react";
import { KeyRound, Check, Mail } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettingsProfile } from "../context/settings-profile-context";

type Mode = "change" | "forgot-send" | "forgot-verify";

export function PasswordSettings() {
  const { profile, loading } = useSettingsProfile();
  const [mode, setMode] = React.useState<Mode>("change");

  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const [sendingReset, setSendingReset] = React.useState(false);
  const [resetSent, setResetSent] = React.useState(false);
  const [resetCode, setResetCode] = React.useState("");
  const [newPass, setNewPass] = React.useState("");
  const [confirmNew, setConfirmNew] = React.useState("");
  const [resetting, setResetting] = React.useState(false);
  const [resetDone, setResetDone] = React.useState(false);

  const [error, setError] = React.useState<string | null>(null);

  const provider = profile?.provider ?? null;
  const email = profile?.email ?? "";

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) { setError("New passwords do not match"); return; }
    if (next.length < 8) { setError("Password must be at least 8 characters"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaved(true); setCurrent(""); setNext(""); setConfirm("");
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(data.error ?? "Failed to update password");
      }
    } finally { setSaving(false); }
  }

  async function handleSendReset() {
    setError(null);
    setSendingReset(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResetSent(true);
      setMode("forgot-verify");
    } finally { setSendingReset(false); }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPass !== confirmNew) { setError("Passwords do not match"); return; }
    if (newPass.length < 8) { setError("Password must be at least 8 characters"); return; }
    setResetting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: resetCode, newPassword: newPass }),
      });
      const data = await res.json();
      if (res.ok) {
        setResetDone(true);
        setTimeout(() => { setMode("change"); setResetSent(false); setResetCode(""); setNewPass(""); setConfirmNew(""); setResetDone(false); }, 3000);
      } else {
        setError(data.error ?? "Reset failed");
      }
    } finally { setResetting(false); }
  }

  if (loading) {
    return (
      <SettingsSection title="Password" description="Manage your password" icon={<KeyRound className="h-4 w-4" />} accent="brand">
        <div className="h-9 skeleton rounded-[var(--radius-md)]" />
      </SettingsSection>
    );
  }

  if (provider === "google") {
    return (
      <SettingsSection title="Password" description="Manage your password" icon={<KeyRound className="h-4 w-4" />} accent="brand">
        <p className="text-sm text-[var(--color-text-muted)]">
          Your account uses Google sign-in. To add a password, visit{" "}
          <strong className="text-[var(--color-text-secondary)]">Profile</strong>.
        </p>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title="Password" description="Change your account password" icon={<KeyRound className="h-4 w-4" />} accent="brand">
      {mode === "change" && (
        <form onSubmit={handleChange} className="space-y-4">
          <div className="space-y-1">
            <Input label="Current password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" placeholder="••••••••" />
            <button type="button" onClick={() => { setError(null); setMode("forgot-send"); }} className="text-xs text-[var(--color-brand)] hover:underline ml-0.5">
              Forgot your current password?
            </button>
          </div>
          <Input label="New password" type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="Min. 8 characters" />
          <Input label="Confirm new password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" placeholder="Repeat new password" />
          {error && <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] rounded-[var(--radius-md)] px-3 py-2">{error}</p>}
          <div className="flex justify-end pt-1">
            <Button type="submit" size="sm" loading={saving}>
              {saved && !saving ? <><Check className="h-3.5 w-3.5" /> Updated</> : "Update Password"}
            </Button>
          </div>
        </form>
      )}

      {mode === "forgot-send" && !resetSent && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-[var(--radius-lg)] bg-[var(--color-brand-light)] border border-[rgba(247,109,1,0.2)] px-4 py-3">
            <Mail className="h-4 w-4 text-[var(--color-brand)] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">Reset via email</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                We&apos;ll send a 6-digit code to <span className="text-[var(--color-text-secondary)]">{email}</span>.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setMode("change"); setError(null); }}>Cancel</Button>
            <Button size="sm" loading={sendingReset} onClick={handleSendReset}>Send reset code</Button>
          </div>
        </div>
      )}

      {mode === "forgot-verify" && (
        <form onSubmit={handleResetPassword} className="space-y-4">
          {resetDone ? (
            <div className="flex items-center gap-2 text-[var(--color-success)] text-sm font-medium">
              <Check className="h-4 w-4" /> Password reset successfully — switching back…
            </div>
          ) : (
            <>
              <p className="text-sm text-[var(--color-text-muted)]">
                Check your inbox at <span className="text-[var(--color-text-primary)]">{email}</span> for the 6-digit code.
              </p>
              <Input label="Reset code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))} required placeholder="000000" className="text-center text-xl tracking-widest" />
              <Input label="New password" type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="Min. 8 characters" />
              <Input label="Confirm new password" type="password" value={confirmNew} onChange={(e) => setConfirmNew(e.target.value)} required autoComplete="new-password" placeholder="Repeat new password" />
              {error && <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] rounded-[var(--radius-md)] px-3 py-2">{error}</p>}
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="secondary" size="sm" type="button" onClick={() => { setMode("change"); setError(null); setResetSent(false); }}>Cancel</Button>
                <Button type="submit" size="sm" loading={resetting}>Reset Password</Button>
              </div>
            </>
          )}
        </form>
      )}
    </SettingsSection>
  );
}
