"use client";

import * as React from "react";
import { Shield } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { Button } from "@/components/ui/button";
import { useBilling } from "../hooks/use-billing";

export function SpendCapSection() {
  const { summary, saveSpendCap, pendingAction, error } = useBilling();
  const [dollars, setDollars] = React.useState("");
  const [alerts, setAlerts] = React.useState(true);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (!summary || ready) return;
    setDollars(summary.overageCapCents == null ? "" : (summary.overageCapCents / 100).toString());
    setAlerts(summary.usageAlerts);
    setReady(true);
  }, [ready, summary]);

  const parsed = dollars.trim() === "" ? null : Number(dollars);
  const capCents = parsed == null ? null : Math.round(parsed * 100);
  const valid = capCents == null || (Number.isFinite(capCents) && capCents >= 0 && capCents <= 10_000_000);

  return (
    <SettingsSection
      title="Overage limit"
      description="One cap across sessions, live minutes, and garment units. Leave it empty for no cap. Each wallet can also run 5% past its included allowance before new usage stops."
      icon={<Shield className="h-4 w-4" />}
      accent="ember"
    >
      <div className="max-w-xl space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[var(--color-text-secondary)]">Stop extra spend at (USD)</span>
          <input
            type="number"
            min={0}
            step={1}
            placeholder="No cap"
            value={dollars}
            onChange={(event) => setDollars(event.target.value)}
            className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
          />
        </label>
        <p className="text-xs text-[var(--color-text-muted)]">
          Overage this cycle: ${((summary?.overageCents ?? 0) / 100).toFixed(2)}
        </p>
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
          <input
            type="checkbox"
            checked={alerts}
            onChange={(event) => setAlerts(event.target.checked)}
          />
          Email me when a wallet reaches 80% and 100% of its included allowance
        </label>
        <Button
          onClick={() => void saveSpendCap(capCents, alerts)}
          loading={pendingAction === "spend-cap"}
          disabled={pendingAction !== null || !valid}
        >
          Save limit
        </Button>
        {error && pendingAction === null && <p className="text-sm text-[var(--color-error)]">{error}</p>}
      </div>
    </SettingsSection>
  );
}
