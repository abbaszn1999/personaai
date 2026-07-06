"use client";

import * as React from "react";
import { Bell, Check } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

interface NotificationToggle {
  id: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

const NOTIFICATIONS: NotificationToggle[] = [
  { id: "new-session",     label: "New session started",        description: "Get notified when a shopper opens your widget",             defaultEnabled: false },
  { id: "weekly-report",   label: "Weekly performance report",  description: "Summary of sessions, conversions, and revenue every Monday", defaultEnabled: true },
  { id: "cart-add",        label: "Add to cart events",         description: "Alert when a shopper adds a product via the widget",         defaultEnabled: false },
  { id: "workspace-pause", label: "Workspace status change",    description: "Notify when a workspace is paused or goes offline",          defaultEnabled: true },
  { id: "billing-alerts",  label: "Billing & usage alerts",     description: "Warn when approaching session limits or payment due",        defaultEnabled: true },
];

const DEFAULT_PREFS = Object.fromEntries(NOTIFICATIONS.map((n) => [n.id, n.defaultEnabled]));

export function NotificationsSettings() {
  const [enabled, setEnabled] = React.useState<Record<string, boolean>>(DEFAULT_PREFS);
  const [loading, setLoading] = React.useState(true);
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/account/notifications");
        if (res.ok) {
          const data = await res.json();
          const prefs = data.preferences ?? {};
          // Merge with defaults — only override keys that exist in DB
          setEnabled({ ...DEFAULT_PREFS, ...prefs });
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function toggle(id: string) {
    setEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/account/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: enabled }),
      });
      if (res.ok) {
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

  return (
    <SettingsSection
      title="Notifications"
      description="Choose which email alerts you receive for your account"
      icon={<Bell className="h-4 w-4" />}
      accent="brand"
    >
      <div className="space-y-3">
        {loading ? (
          <div className="space-y-2">
            {NOTIFICATIONS.map((n) => <div key={n.id} className="h-14 rounded-[var(--radius-lg)] skeleton" />)}
          </div>
        ) : (
          NOTIFICATIONS.map((n) => {
            const on = enabled[n.id];
            return (
              <div
                key={n.id}
                className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{n.label}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{n.description}</p>
                </div>
                <button
                  onClick={() => toggle(n.id)}
                  role="switch"
                  aria-checked={on}
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
                    on ? "bg-[var(--color-brand)]" : "bg-[var(--color-border)]"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200",
                      on ? "translate-x-4" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            );
          })
        )}

        {error && (
          <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] rounded-[var(--radius-md)] px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end pt-1">
          <Button size="sm" loading={saving} onClick={handleSave} disabled={loading}>
            {saved && !saving ? <><Check className="h-3.5 w-3.5" /> Saved</> : "Save Preferences"}
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
