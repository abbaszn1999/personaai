"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { PlanTierId } from "@/modules/billing/types";

export function MerchantActions({
  userId,
  email,
  tierId,
}: {
  userId: string;
  email: string;
  tierId: PlanTierId | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [wallet, setWallet] = useState<"garments" | "live" | "sessions">("garments");
  const [amount, setAmount] = useState("100");
  const [extendDays, setExtendDays] = useState("7");

  const subscribed = tierId !== null;
  const canUpgrade = tierId === "trial";

  async function run(url: string, body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string; redirect?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Request failed");
        return;
      }
      if (data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      setMessage("Saved");
      router.refresh();
    } catch {
      setMessage("Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-base space-y-5 p-5">
      <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Actions</h2>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Access</h3>
        <Button type="button" disabled={busy} onClick={() => run("/api/admin/impersonate", { userId })}>
          Log in as {email}
        </Button>
      </section>

      <section className="space-y-2 border-t border-[var(--color-border)] pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Subscription</h3>
        {!subscribed && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run(
                  `/api/admin/merchants/${userId}/subscription`,
                  { action: "grant_plan", tier: "trial" },
                  `Give ${email} a Trial subscription for 30 days? Nothing is charged now, and it will not renew.`
                )
              }
            >
              Give Trial
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run(
                  `/api/admin/merchants/${userId}/subscription`,
                  { action: "grant_plan", tier: "main" },
                  `Give ${email} Main for 30 days with no charge now? Stripe bills when that period ends if a payment method is on file.`
                )
              }
            >
              Give Main
            </Button>
          </div>
        )}
        {canUpgrade && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              run(
                `/api/admin/merchants/${userId}/subscription`,
                { action: "change_plan", tier: "main" },
                `Upgrade ${email} to Main? Trial ends now. Unused units from a paid Trial move into the balances; an admin-granted Trial carries nothing. Main starts with 30 days at no charge, then Stripe bills if a payment method is on file.`
              )
            }
          >
            Upgrade to Main
          </Button>
        )}
        {tierId === "main" && (
          <p className="text-sm text-[var(--color-text-secondary)]">On Main. A downgrade back to Trial is not available.</p>
        )}
        {tierId === "main" && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-[var(--color-text-muted)]">
              Extend days
              <input
                value={extendDays}
                onChange={(e) => setExtendDays(e.target.value)}
                className="mt-1 block h-9 w-20 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2 text-sm"
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run(
                  `/api/admin/merchants/${userId}/subscription`,
                  { action: "extend", days: Number(extendDays) },
                  `Push the next invoice by ${extendDays} days without charging now?`
                )
              }
            >
              Extend
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(
                  `/api/admin/merchants/${userId}/subscription`,
                  { action: "cancel" },
                  "Cancel at the end of the current period? Nothing is charged or refunded."
                )
              }
            >
              Cancel at period end
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-2 border-t border-[var(--color-border)] pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Grant balances</h3>
        {tierId === "main" ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-[var(--color-text-muted)]">
              Wallet
              <select
                value={wallet}
                onChange={(e) => setWallet(e.target.value as typeof wallet)}
                className="mt-1 block h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2 text-sm"
              >
                <option value="garments">Garments</option>
                <option value="live">Live minutes</option>
                <option value="sessions">Sessions</option>
              </select>
            </label>
            <label className="text-xs text-[var(--color-text-muted)]">
              Amount
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 block h-9 w-28 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2 text-sm"
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run(
                  `/api/admin/merchants/${userId}/grant`,
                  { wallet, amount: Number(amount) },
                  `Add ${amount} ${wallet} to ${email}?`
                )
              }
            >
              Grant
            </Button>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">
            {tierId === "trial" ? "Available after upgrading to Main." : "Requires a Main subscription."}
          </p>
        )}
      </section>

      <section className="border-t border-[var(--color-border)] pt-4">
        <Button
          type="button"
          variant="danger"
          disabled={busy}
          onClick={() =>
            run(`/api/admin/merchants/${userId}/delete`, {}, `Delete ${email} and all of their data? This cannot be undone.`)
          }
        >
          Delete merchant
        </Button>
      </section>

      {message && <p className="text-sm text-[var(--color-text-secondary)]">{message}</p>}
    </div>
  );
}
