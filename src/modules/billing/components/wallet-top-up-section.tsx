"use client";

import * as React from "react";
import { Wallet } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
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

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function WalletTopUpSection() {
  const {
    summary,
    purchaseGarmentUnits,
    purchaseSessionUnits,
    purchaseLiveMinutes,
    pendingAction,
    error,
  } = useBilling();
  const [sessions, setSessions] = React.useState<number | null>(null);
  const [minutes, setMinutes] = React.useState<number | null>(null);
  const [garments, setGarments] = React.useState<number | null>(null);

  const sessionQty = sessions ?? summary?.sessions.suggestedTopUp ?? SESSION_MIN;
  const minuteQty = minutes ?? summary?.liveTryOn.suggestedTopUp ?? LIVE_MIN_MINUTES;
  const garmentQty = garments ?? summary?.images.suggestedTopUp ?? GARMENT_MIN;
  const sessionQuote = quoteSessionUnits(sessionQty);
  const minuteQuote = quoteLiveMinutes(minuteQty);
  const garmentQuote = quoteGarmentUnits(garmentQty);

  return (
    <SettingsSection
      title="Add wallet balance"
      description="Buy session units, live minutes, or garment units at cost. The suggested amount covers about two weeks at your current pace."
      icon={<Wallet className="h-4 w-4" />}
      accent="violet"
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <QuantityField
          label="Session units"
          hint={`$${dollars(SESSION_PACK_CENTS)} per ${SESSION_PACK_UNITS.toLocaleString()} · minimum ${SESSION_MIN.toLocaleString()}`}
          burn={summary?.sessions.dailyBurn}
          projected={summary?.sessions.projectedCycleTotal}
          unit="units"
          value={sessionQty}
          min={SESSION_MIN}
          max={SESSION_MAX}
          step={SESSION_PACK_UNITS}
          onChange={setSessions}
          price={sessionQuote ? `$${dollars(sessionQuote.amountCents)}` : "—"}
          disabled={pendingAction !== null || !sessionQuote}
          loading={pendingAction === "sessions"}
          onBuy={() => void purchaseSessionUnits(sessionQty)}
        />
        <QuantityField
          label="Live minutes"
          hint={`$${dollars(LIVE_MINUTE_CENTS)} per minute · minimum ${LIVE_MIN_MINUTES}`}
          burn={summary?.liveTryOn.dailyBurn}
          projected={summary?.liveTryOn.projectedCycleTotal}
          unit="min"
          value={minuteQty}
          min={LIVE_MIN_MINUTES}
          max={LIVE_MAX_MINUTES}
          step={1}
          onChange={setMinutes}
          price={minuteQuote ? `$${dollars(minuteQuote.amountCents)}` : "—"}
          disabled={pendingAction !== null || !minuteQuote}
          loading={pendingAction === "live-minutes"}
          onBuy={() => void purchaseLiveMinutes(minuteQty)}
        />
        <QuantityField
          label="Garment units"
          hint={`$${dollars(GARMENT_PACK_CENTS)} per ${GARMENT_PACK_UNITS} · minimum ${GARMENT_MIN.toLocaleString()}`}
          burn={summary?.images.dailyBurn}
          projected={summary?.images.projectedCycleTotal}
          unit="units"
          value={garmentQty}
          min={GARMENT_MIN}
          max={GARMENT_MAX}
          step={GARMENT_PACK_UNITS}
          onChange={setGarments}
          price={garmentQuote ? `$${dollars(garmentQuote.amountCents)}` : "—"}
          disabled={pendingAction !== null || !garmentQuote}
          loading={pendingAction === "garments"}
          onBuy={() => void purchaseGarmentUnits(garmentQty)}
        />
      </div>
      <p className="mt-4 text-xs text-[var(--color-text-muted)]">
        Secure checkout is handled by Stripe. Balance is added only after payment is confirmed.
      </p>
      {error && <p className="mt-2 text-sm text-[var(--color-error)]">{error}</p>}
    </SettingsSection>
  );
}

function QuantityField(props: {
  label: string;
  hint: string;
  burn?: number;
  projected?: number;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  price: string;
  disabled: boolean;
  loading: boolean;
  onBuy: () => void;
}) {
  return (
    <div className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-4">
      <div>
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">{props.label}</p>
        <p className="text-xs text-[var(--color-text-muted)]">{props.hint}</p>
      </div>
      <p className="text-xs text-[var(--color-text-secondary)]">
        {props.burn == null
          ? "Burn loads with usage"
          : `${props.burn.toLocaleString()} ${props.unit}/day · projected ${Math.round(props.projected ?? 0).toLocaleString()} this cycle`}
      </p>
      <input
        type="number"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(event) => {
          const next = Number.parseInt(event.target.value, 10);
          props.onChange(Number.isFinite(next) ? next : props.min);
        }}
        className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
      />
      <Button onClick={props.onBuy} loading={props.loading} disabled={props.disabled} className="w-full">
        Add — {props.price}
      </Button>
    </div>
  );
}
