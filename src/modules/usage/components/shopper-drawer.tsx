"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import {
  formatUsdFromNanos,
  shopperCostNanos,
  shopperLabel,
  type ShopperUsage,
} from "@/lib/billing/usage-report";
import { formatWhen } from "../constants";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-[var(--color-border)] last:border-0">
      <span className="text-sm text-[var(--color-text-muted)]">{label}</span>
      <span className="text-sm font-semibold text-[var(--color-text-primary)]">{value}</span>
    </div>
  );
}

export function ShopperDrawer({
  sessionId,
  apiQuery,
  onClose,
}: {
  sessionId: string;
  apiQuery: string;
  onClose: () => void;
}) {
  const [shopper, setShopper] = React.useState<ShopperUsage | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    const query = new URLSearchParams(apiQuery);
    query.set("sessionId", sessionId);
    void fetch(`/api/account/usage/sessions?${query.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Unable to load shopper");
        return body as { shoppers: ShopperUsage[] };
      })
      .then((body) => {
        if (active) setShopper(body.shoppers[0] ?? null);
      })
      .catch(() => {
        if (active) setShopper(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiQuery, sessionId]);

  const title = shopper ? shopperLabel(shopper) : "Shopper";
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      description={shopper?.source === "preview" ? "Your own preview" : shopper?.source === "store" ? "Store shopper" : "Usage from before sessions were tracked"}
    >
      {loading ? (
        <div className="h-40 animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-surface-base)]" />
      ) : !shopper ? (
        <p className="text-sm text-[var(--color-text-muted)]">No usage for this shopper in the selected range.</p>
      ) : (
        <div>
          <p className="text-2xl font-display font-extrabold text-[var(--color-text-primary)] mb-4">
            {formatUsdFromNanos(shopperCostNanos(shopper))}
          </p>
          <Row label="First seen" value={formatWhen(shopper.firstSeen)} />
          <Row label="Last seen" value={formatWhen(shopper.lastSeen)} />
          <Row label="Conversation" value={`${shopper.chatCalls.toLocaleString()} calls · ${shopper.chatUnits.toLocaleString()} units`} />
          <Row label="Catalog search" value={`${shopper.searches.toLocaleString()} searches · ${shopper.searchUnits.toLocaleString()} units`} />
          <Row label="Garment try-on" value={`${shopper.tryOnCount.toLocaleString()} renders · ${shopper.tryOnUnits.toLocaleString()} units`} />
          <Row label="Avatar" value={`${shopper.avatarCount.toLocaleString()} images · ${shopper.avatarUnits.toLocaleString()} units`} />
          <Row label="Live try-on" value={`${(shopper.liveSeconds / 60).toLocaleString(undefined, { maximumFractionDigits: 1 })} min`} />
        </div>
      )}
    </Modal>
  );
}
