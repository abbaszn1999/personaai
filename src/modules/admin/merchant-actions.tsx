"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function MerchantActions({ userId, email, hasSubscription }: { userId: string; email: string; hasSubscription: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [wallet, setWallet] = useState<"garments" | "live" | "sessions">("garments");
  const [amount, setAmount] = useState("100");
  const [extendDays, setExtendDays] = useState("7");
  const [plan, setPlan] = useState<"trial" | "main">("main");

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
    <div className="card-base space-y-4 p-5">
      <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Actions</h2>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => run("/api/admin/impersonate", { userId })}>Log in as {email}</Button>
        <Button
          type="button"
          variant="danger"
          disabled={busy}
          onClick={() => run(`/api/admin/merchants/${userId}/delete`, {}, `Delete ${email} and all of their data? This cannot be undone.`)}
        >
          Delete merchant
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-[var(--color-text-muted)]">
          Wallet
          <select value={wallet} onChange={(e) => setWallet(e.target.value as typeof wallet)} className="mt-1 block h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2 text-sm">
            <option value="garments">Garments</option>
            <option value="live">Live minutes</option>
            <option value="sessions">Sessions</option>
          </select>
        </label>
        <label className="text-xs text-[var(--color-text-muted)]">
          Amount
          <input value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 block h-9 w-28 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2 text-sm" />
        </label>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => run(`/api/admin/merchants/${userId}/grant`, { wallet, amount: Number(amount) }, `Add ${amount} ${wallet} to ${email}?`)}>Grant</Button>
      </div>
      {hasSubscription && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-[var(--color-text-muted)]">
            Plan
            <select value={plan} onChange={(e) => setPlan(e.target.value as typeof plan)} className="mt-1 block h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2 text-sm">
              <option value="main">Main</option>
              <option value="trial">Trial</option>
            </select>
          </label>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => run(`/api/admin/merchants/${userId}/subscription`, { action: "change_plan", tier: plan }, `Switch the Stripe price to ${plan} with no proration charge?`)}>Change plan</Button>
          <label className="text-xs text-[var(--color-text-muted)]">
            Extend days
            <input value={extendDays} onChange={(e) => setExtendDays(e.target.value)} className="mt-1 block h-9 w-20 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2 text-sm" />
          </label>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => run(`/api/admin/merchants/${userId}/subscription`, { action: "extend", days: Number(extendDays) }, `Push the next invoice by ${extendDays} days without charging now?`)}>Extend</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => run(`/api/admin/merchants/${userId}/subscription`, { action: "cancel" }, "Cancel at the end of the current period? Nothing is charged or refunded.")}>Cancel at period end</Button>
        </div>
      )}
      {message && <p className="text-sm text-[var(--color-text-secondary)]">{message}</p>}
    </div>
  );
}
