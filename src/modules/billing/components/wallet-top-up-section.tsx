"use client";

import * as React from "react";
import { SettingsCard } from "@/components/ui/settings-card";
import { Button } from "@/components/ui/button";
import {
  GARMENT_MAX_PACKS,
  GARMENT_MIN_PACKS,
  GARMENT_PACK_CENTS,
  GARMENT_PACK_UNITS,
  LIVE_MAX_MINUTES,
  LIVE_MIN_MINUTES,
  LIVE_MINUTE_CENTS,
  SESSION_MAX_PACKS,
  SESSION_MIN_PACKS,
  SESSION_PACK_CENTS,
  SESSION_PACK_UNITS,
} from "@/lib/billing/pricing";
import { quoteGarmentUnits, quoteLiveMinutes, quoteSessionUnits } from "@/lib/billing/wallets";
import { useBilling } from "../hooks/use-billing";

const SESSION_MIN = SESSION_MIN_PACKS * SESSION_PACK_UNITS;
const SESSION_MAX = SESSION_MAX_PACKS * SESSION_PACK_UNITS;
const GARMENT_MIN = GARMENT_MIN_PACKS * GARMENT_PACK_UNITS;
const GARMENT_MAX = GARMENT_MAX_PACKS * GARMENT_PACK_UNITS;

function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function WalletTopUpSection() {
  const { summary, purchaseGarmentUnits, purchaseSessionUnits, purchaseLiveMinutes, pendingAction } = useBilling();
  const [sessions, setSessions] = React.useState<number | null>(null);
  const [minutes, setMinutes] = React.useState<number | null>(null);
  const [garments, setGarments] = React.useState<number | null>(null);

  const sessionQty = sessions ?? summary?.sessions.suggestedTopUp ?? SESSION_MIN;
  const minuteQty = minutes ?? summary?.liveTryOn.suggestedTopUp ?? LIVE_MIN_MINUTES;
  const garmentQty = garments ?? summary?.images.suggestedTopUp ?? GARMENT_MIN;
  const sessionQuote = quoteSessionUnits(sessionQty);
  const minuteQuote = quoteLiveMinutes(minuteQty);
  const garmentQuote = quoteGarmentUnits(garmentQty);
  const busy = pendingAction !== null;
  const onMain = summary?.tierId === "main";

  if (summary && !onMain) {
    return (
      <SettingsCard
        id="add-balance"
        title="Add balance"
        description="Extra balance is available on the Main plan."
      >
        <p className="text-sm text-[var(--color-text-secondary)]">
          Session units, live minutes, and garment units can be purchased after you upgrade to Main.
        </p>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      id="add-balance"
      title="Add balance"
      description="Buy extra usage at cost. It's spent only after your plan's included amount runs out. Suggested amounts cover about two weeks at your current pace."
      footer="Paid through Stripe. Balance is added once the payment clears."
    >
      <div className="divide-y divide-[var(--color-border)]">
        <WalletRow
          title="Session units"
          price={`${usd(SESSION_PACK_CENTS)} per ${SESSION_PACK_UNITS.toLocaleString()}`}
          balance={summary ? `${summary.sessions.unitsBalance.toLocaleString()} purchased` : null}
          unit="units"
          value={sessionQty}
          min={SESSION_MIN}
          max={SESSION_MAX}
          step={SESSION_PACK_UNITS}
          onChange={setSessions}
          total={sessionQuote ? usd(sessionQuote.amountCents) : null}
          disabled={busy || !sessionQuote}
          loading={pendingAction === "sessions"}
          onBuy={() => void purchaseSessionUnits(sessionQty)}
        />
        <WalletRow
          title="Live try-on minutes"
          price={`${usd(LIVE_MINUTE_CENTS)} per minute`}
          balance={
            summary ? `${Math.floor(summary.liveTryOn.purchasedSecondsBalance / 60).toLocaleString()} min purchased` : null
          }
          unit="min"
          value={minuteQty}
          min={LIVE_MIN_MINUTES}
          max={LIVE_MAX_MINUTES}
          step={1}
          onChange={setMinutes}
          total={minuteQuote ? usd(minuteQuote.amountCents) : null}
          disabled={busy || !minuteQuote}
          loading={pendingAction === "live-minutes"}
          onBuy={() => void purchaseLiveMinutes(minuteQty)}
        />
        <WalletRow
          title="Garment units"
          price={`${usd(GARMENT_PACK_CENTS)} per ${GARMENT_PACK_UNITS.toLocaleString()}`}
          balance={summary ? `${summary.images.creditsBalance.toLocaleString()} purchased` : null}
          unit="units"
          value={garmentQty}
          min={GARMENT_MIN}
          max={GARMENT_MAX}
          step={GARMENT_PACK_UNITS}
          onChange={setGarments}
          total={garmentQuote ? usd(garmentQuote.amountCents) : null}
          disabled={busy || !garmentQuote}
          loading={pendingAction === "garments"}
          onBuy={() => void purchaseGarmentUnits(garmentQty)}
        />
      </div>
    </SettingsCard>
  );
}

function WalletRow(props: {
  title: string;
  price: string;
  balance: string | null;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  total: string | null;
  disabled: boolean;
  loading: boolean;
  onBuy: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-[12rem] flex-1">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{props.title}</p>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
          {props.price}
          {props.balance ? ` · ${props.balance}` : ""}
        </p>
      </div>
      <label className="flex h-9 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] focus-within:border-[var(--color-brand)]">
        <input
          type="number"
          aria-label={`${props.title} to buy`}
          min={props.min}
          max={props.max}
          step={props.step}
          value={props.value}
          onChange={(event) => {
            const next = Number.parseInt(event.target.value, 10);
            props.onChange(Number.isFinite(next) ? next : props.min);
          }}
          className="h-full w-28 bg-transparent px-3 text-sm text-[var(--color-text-primary)] focus:outline-none"
        />
        <span className="pr-3 text-xs text-[var(--color-text-muted)]">{props.unit}</span>
      </label>
      <Button size="sm" onClick={props.onBuy} loading={props.loading} disabled={props.disabled} className="min-w-[7.5rem]">
        {props.total ? `Buy for ${props.total}` : "Below minimum"}
      </Button>
    </div>
  );
}
