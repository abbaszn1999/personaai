"use client";

import * as React from "react";
import { Shield, Monitor, Check } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { Button } from "@/components/ui/button";

interface SessionEntry {
  sid: string;
  expire: string;
  isCurrent: boolean;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 1) return "Expires today";
  if (diffDays <= 7) return `Expires in ${diffDays} days`;
  return `Expires ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

export function SecuritySettings() {
  const [sessions, setSessions] = React.useState<SessionEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [revoking, setRevoking] = React.useState(false);
  const [revoked, setRevoked] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function loadSessions() {
    try {
      const res = await fetch("/api/account/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { loadSessions(); }, []);

  async function handleRevokeOthers() {
    setError(null);
    setRevoking(true);
    try {
      const res = await fetch("/api/account/sessions", { method: "DELETE" });
      if (res.ok) {
        setRevoked(true);
        setSessions((prev) => prev.filter((s) => s.isCurrent));
        setTimeout(() => setRevoked(false), 2500);
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to revoke sessions");
      }
    } finally {
      setRevoking(false);
    }
  }

  const otherSessions = sessions.filter((s) => !s.isCurrent);
  const currentSession = sessions.find((s) => s.isCurrent);

  return (
    <SettingsSection
      title="Security"
      description="Active sessions and device management"
      icon={<Shield className="h-4 w-4" />}
      accent="brand"
    >
      <div className="space-y-4">
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-14 rounded-[var(--radius-lg)] skeleton" />)}
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No active sessions found.</p>
        ) : (
          <div className="space-y-2">
            {currentSession && (
              <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-4 py-3">
                <div className="h-9 w-9 rounded-[var(--radius-md)] bg-[var(--color-success-light)] flex items-center justify-center shrink-0">
                  <Monitor className="h-4 w-4 text-[var(--color-success)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">This device</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{formatDate(currentSession.expire)}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-success-light)] text-[var(--color-success)] shrink-0">
                  CURRENT
                </span>
              </div>
            )}
            {otherSessions.map((s) => (
              <div key={s.sid} className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-4 py-3 opacity-75">
                <div className="h-9 w-9 rounded-[var(--radius-md)] bg-[var(--color-surface-elevated)] flex items-center justify-center shrink-0">
                  <Monitor className="h-4 w-4 text-[var(--color-text-muted)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-secondary)]">Other device</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{formatDate(s.expire)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] rounded-[var(--radius-md)] px-3 py-2">{error}</p>
        )}

        {otherSessions.length > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)]">
            <p className="text-xs text-[var(--color-text-muted)]">
              {otherSessions.length} other session{otherSessions.length !== 1 ? "s" : ""} active
            </p>
            <Button variant="danger" size="sm" loading={revoking} onClick={handleRevokeOthers}>
              {revoked && !revoking ? <><Check className="h-3.5 w-3.5" /> Done</> : "Sign out all other devices"}
            </Button>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
