"use client";

import * as React from "react";
import { Check, KeyRound, Mail } from "lucide-react";
import { FormError, SettingsCard, SettingsRow, StatusBadge } from "@/components/ui/settings-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettingsProfile } from "../context/settings-profile-context";

type Panel = "closed" | "change" | "set" | "forgot-send" | "forgot-verify";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, error: data.error };
}

export function SignInCard() {
  const { profile, loading, updateLocal } = useSettingsProfile();
  const [panel, setPanel] = React.useState<Panel>("closed");
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  if (loading || !profile) {
    return <div className="card-base h-56 animate-pulse" />;
  }

  const email = profile.email;
  const googleConnected = Boolean(profile.googleId);
  const hasPassword = profile.hasPassword;

  function open(nextPanel: Panel) {
    setPanel(nextPanel);
    setError(null);
    setNotice(null);
    setCurrent("");
    setNext("");
    setConfirm("");
    setCode("");
  }

  function checkNewPassword(): boolean {
    if (next.length < 8) {
      setError("Use at least 8 characters.");
      return false;
    }
    if (next !== confirm) {
      setError("The two new passwords don't match.");
      return false;
    }
    return true;
  }

  async function run(task: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) {
    setError(null);
    setBusy(true);
    try {
      const result = await task();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Try again.");
        return;
      }
      after?.();
      setPanel("closed");
      setNotice(success);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (panel === "change") {
      if (!checkNewPassword()) return;
      void run(
        () => postJson("/api/account/change-password", { currentPassword: current, newPassword: next }),
        "Password updated."
      );
    } else if (panel === "set") {
      if (!checkNewPassword()) return;
      void run(
        () => postJson("/api/account/set-password", { password: next }),
        "Password added. You can now sign in with your email too.",
        () => updateLocal({ hasPassword: true })
      );
    } else if (panel === "forgot-verify") {
      if (!checkNewPassword()) return;
      void run(
        () => postJson("/api/auth/reset-password", { email, code, newPassword: next }),
        "Password reset."
      );
    }
  }

  async function sendResetCode() {
    setError(null);
    setBusy(true);
    try {
      await postJson("/api/auth/forgot-password", { email });
      setPanel("forgot-verify");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsCard title="Sign-in & security" description="How you get into your account.">
      <div className="divide-y divide-[var(--color-border)]">
        <SettingsRow
          icon={<Mail className="h-4 w-4 text-[var(--color-text-muted)]" />}
          title={email}
          description={
            profile.provider === "google"
              ? "Your email comes from Google and can't be changed here."
              : "Contact support to change your email."
          }
        />
        <SettingsRow
          icon={<KeyRound className="h-4 w-4 text-[var(--color-text-muted)]" />}
          title="Password"
          description={hasPassword ? "Set" : "Not set. You sign in with Google."}
        >
          {panel === "closed" && (
            <Button variant="secondary" size="sm" onClick={() => open(hasPassword ? "change" : "set")}>
              {hasPassword ? "Change password" : "Add password"}
            </Button>
          )}
        </SettingsRow>
        <SettingsRow
          icon={<GoogleMark />}
          title="Google"
          description={googleConnected ? email : "Not linked"}
        >
          <StatusBadge tone={googleConnected ? "success" : "neutral"}>
            {googleConnected ? "Connected" : "Not connected"}
          </StatusBadge>
        </SettingsRow>
      </div>

      {notice && panel === "closed" && (
        <p className="flex items-center gap-2 text-sm font-medium text-[var(--color-success)]">
          <Check className="h-4 w-4" /> {notice}
        </p>
      )}

      {panel === "forgot-send" && (
        <div className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-4">
          <p className="text-sm text-[var(--color-text-secondary)]">
            We&apos;ll email a 6-digit code to <span className="text-[var(--color-text-primary)]">{email}</span>.
          </p>
          {error && <FormError>{error}</FormError>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => open("change")}>
              Back
            </Button>
            <Button size="sm" loading={busy} onClick={() => void sendResetCode()}>
              Send code
            </Button>
          </div>
        </div>
      )}

      {(panel === "change" || panel === "set" || panel === "forgot-verify") && (
        <form
          onSubmit={submit}
          className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-4"
        >
          {panel === "forgot-verify" && (
            <Input
              label={`Code sent to ${email}`}
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              required
              placeholder="000000"
              className="tracking-[0.4em]"
            />
          )}
          {panel === "change" && (
            <div className="space-y-1.5">
              <Input
                label="Current password"
                type="password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => open("forgot-send")}
                className="text-xs font-medium text-[var(--color-brand)] hover:underline"
              >
                Forgot it?
              </button>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="New password"
              type="password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              hint="At least 8 characters"
            />
            <Input
              label="Confirm new password"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          {error && <FormError>{error}</FormError>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => open("closed")} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={busy}>
              {panel === "set" ? "Add password" : panel === "forgot-verify" ? "Reset password" : "Update password"}
            </Button>
          </div>
        </form>
      )}
    </SettingsCard>
  );
}
