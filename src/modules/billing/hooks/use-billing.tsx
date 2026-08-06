"use client";

import * as React from "react";
import { getPlanTiers } from "../constants";
import type { BillingSummary, PlanTierId } from "../types";
import type { WorkspaceMode } from "@/modules/workspaces/types";

interface BillingContextValue {
  summary: BillingSummary | null;
  loading: boolean;
  /** @deprecated Use `pendingAction` to scope loading state to a single button. */
  mutating: boolean;
  /** Identifies which specific action is currently in flight, e.g. `"credits:starter"`. */
  pendingAction: string | null;
  error: string | null;
  checkoutNotice: string | null;
  tiers: ReturnType<typeof getPlanTiers>;
  activeTier: ReturnType<typeof getPlanTiers>[number];
  reload: () => Promise<void>;
  switchTier: (tierId: PlanTierId) => Promise<boolean>;
  purchaseCreditBundle: (bundleId: string) => Promise<boolean>;
  purchaseLiveMinutes: (minutes: number) => Promise<boolean>;
  openBillingPortal: () => Promise<boolean>;
}

const BillingContext = React.createContext<BillingContextValue | null>(null);

interface BillingProviderProps {
  workspaceId: string;
  mode: WorkspaceMode;
  children: React.ReactNode;
}

export function BillingProvider({ workspaceId, mode, children }: BillingProviderProps) {
  const [summary, setSummary] = React.useState<BillingSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/account/billing-summary?workspaceId=${encodeURIComponent(workspaceId)}`, {
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to load billing usage");
      setSummary(data as BillingSummary);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load billing usage");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  React.useEffect(() => {
    const checkout = new URLSearchParams(window.location.search).get("checkout");
    const orderId = new URLSearchParams(window.location.search).get("orderId");
    if (checkout === "cancelled") {
      const timer = window.setTimeout(() => setCheckoutNotice("Checkout was cancelled. No charge was made."), 0);
      return () => window.clearTimeout(timer);
    }
    if (checkout !== "success" || !orderId) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setCheckoutNotice("Payment received. Confirming your billing update…");
      for (let attempt = 0; attempt < 12 && !cancelled; attempt++) {
        const response = await fetch(
          `/api/account/billing/order-status?orderId=${encodeURIComponent(orderId)}`,
          { cache: "no-store" }
        );
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.fulfilled) {
          await load();
          window.dispatchEvent(new Event("autommerce:usage-changed"));
          if (!cancelled) setCheckoutNotice("Payment confirmed and your account has been updated.");
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1_500));
      }
      if (!cancelled) {
        setCheckoutNotice("Payment is still processing. Your account will update automatically after Stripe confirms it.");
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [load]);

  const mutate = React.useCallback(
    async (actionKey: string, url: string, body: Record<string, unknown>, method = "POST") => {
      setPendingAction(actionKey);
      setError(null);
      try {
        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, workspaceId }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Billing update failed");
        if (typeof data.url === "string") {
          window.location.assign(data.url);
          return true;
        }
        await load();
        window.dispatchEvent(new Event("autommerce:usage-changed"));
        return true;
      } catch (mutationError) {
        setError(mutationError instanceof Error ? mutationError.message : "Billing update failed");
        return false;
      } finally {
        setPendingAction(null);
      }
    },
    [load, workspaceId]
  );

  const openBillingPortal = React.useCallback(async () => {
    setPendingAction("portal");
    setError(null);
    try {
      const response = await fetch("/api/account/billing/portal", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.url !== "string") {
        throw new Error(data.error || "Unable to open billing portal");
      }
      window.location.assign(data.url);
      return true;
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : "Unable to open billing portal");
      return false;
    } finally {
      setPendingAction(null);
    }
  }, []);

  const tiers = React.useMemo(() => getPlanTiers(mode), [mode]);
  const tierId = summary?.tierId ?? "fixed";
  const activeTier = tiers.find((tier) => tier.id === tierId) ?? tiers[0];

  const value = React.useMemo<BillingContextValue>(
    () => ({
      summary,
      loading,
      mutating: pendingAction !== null,
      pendingAction,
      error,
      checkoutNotice,
      tiers,
      activeTier,
      reload: load,
      switchTier: (nextTierId) =>
        mutate(`plan:${nextTierId}`, "/api/account/plan", { tierId: nextTierId }, "PUT"),
      purchaseCreditBundle: (bundleId) =>
        mutate(`credits:${bundleId}`, "/api/account/credits/purchase", { bundleId }),
      purchaseLiveMinutes: (minutes) =>
        mutate("live-minutes", "/api/account/live-minutes/purchase", { minutes }),
      openBillingPortal,
    }),
    [activeTier, checkoutNotice, error, load, loading, mutate, openBillingPortal, pendingAction, summary, tiers]
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling(): BillingContextValue {
  const context = React.useContext(BillingContext);
  if (!context) throw new Error("useBilling must be used inside BillingProvider");
  return context;
}
