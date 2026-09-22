import {
  GARMENT_PACK_CENTS,
  GARMENT_PACK_UNITS,
  LIVE_MINUTE_CENTS,
  SESSION_PACK_CENTS,
  SESSION_PACK_UNITS,
} from "@/lib/billing/pricing";
import type { PlanTierId } from "@/modules/billing/types";

export const STRIPE_CURRENCY = "usd";

export type StripePurchaseKey =
  | "plan_trial"
  | "plan_main"
  | "garment_units"
  | "session_units"
  | "live_minutes";

export type StripeOrderKind = "subscription" | "image_credits" | "live_tryon_seconds" | "session_units";

export interface StripeCatalogItem {
  key: StripePurchaseKey;
  kind: StripeOrderKind;
  envKey: string;
  amountCents: number;
  tierId?: PlanTierId;
  creditsPerUnit?: number;
  secondsPerUnit?: number;
  /** Purchased units represented by one Stripe quantity. Sessions and garments are packs. */
  unitsPerUnit?: number;
}

export const STRIPE_CATALOG: Record<StripePurchaseKey, StripeCatalogItem> = {
  plan_trial: {
    key: "plan_trial",
    kind: "subscription",
    envKey: "STRIPE_PRICE_PLAN_TRIAL",
    amountCents: 45_000,
    tierId: "trial",
  },
  plan_main: {
    key: "plan_main",
    kind: "subscription",
    envKey: "STRIPE_PRICE_PLAN_MAIN",
    amountCents: 150_000,
    tierId: "main",
  },
  garment_units: {
    key: "garment_units",
    kind: "image_credits",
    envKey: "STRIPE_PRICE_GARMENT_UNITS",
    amountCents: GARMENT_PACK_CENTS,
    creditsPerUnit: GARMENT_PACK_UNITS,
    unitsPerUnit: GARMENT_PACK_UNITS,
  },
  session_units: {
    key: "session_units",
    kind: "session_units",
    envKey: "STRIPE_PRICE_SESSION_UNITS",
    amountCents: SESSION_PACK_CENTS,
    unitsPerUnit: SESSION_PACK_UNITS,
  },
  live_minutes: {
    key: "live_minutes",
    kind: "live_tryon_seconds",
    envKey: "STRIPE_PRICE_LIVE_MINUTE",
    amountCents: LIVE_MINUTE_CENTS,
    secondsPerUnit: 60,
    unitsPerUnit: 1,
  },
};

export interface StripeServerConfig {
  secretKey: string;
  webhookSecret: string;
  appUrl: string;
  portalConfigurationId: string | null;
  automaticTax: boolean;
  pastDueGraceDays: number;
}

export function getStripePastDueGraceDays(): number {
  const graceDays = Number.parseInt(process.env.STRIPE_PAST_DUE_GRACE_DAYS ?? "3", 10);
  return Number.isFinite(graceDays) ? Math.max(0, Math.min(graceDays, 30)) : 3;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function getStripeServerConfig(): StripeServerConfig {
  const appUrl = required("APP_URL").replace(/\/+$/, "");
  const parsed = new URL(appUrl);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("APP_URL must use HTTPS outside localhost");
  }

  return {
    secretKey: required("STRIPE_SECRET_KEY"),
    webhookSecret: required("STRIPE_WEBHOOK_SECRET"),
    appUrl,
    portalConfigurationId: process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim() || null,
    automaticTax: process.env.STRIPE_AUTOMATIC_TAX_ENABLED === "true",
    pastDueGraceDays: getStripePastDueGraceDays(),
  };
}

export function purchaseKeyForPlan(tierId: PlanTierId): "plan_trial" | "plan_main" {
  return tierId === "main" ? "plan_main" : "plan_trial";
}

export function getStripePriceId(key: StripePurchaseKey): string {
  return required(STRIPE_CATALOG[key].envKey);
}

export function getPurchaseKeyForPriceId(priceId: string): StripePurchaseKey | null {
  for (const item of Object.values(STRIPE_CATALOG)) {
    if (process.env[item.envKey]?.trim() === priceId) return item.key;
  }
  return null;
}

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.APP_URL
  );
}
