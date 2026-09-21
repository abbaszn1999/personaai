import type { WorkspaceMode } from "@/modules/workspaces/types";

export const STRIPE_CURRENCY = "usd";

export type StripePurchaseKey =
  | "wearable_fixed"
  | "credits_starter"
  | "credits_growth"
  | "credits_scale"
  | "live_minutes";

export type StripeOrderKind = "subscription" | "image_credits" | "live_tryon_seconds";

export interface StripeCatalogItem {
  key: StripePurchaseKey;
  kind: StripeOrderKind;
  envKey: string;
  amountCents: number;
  mode?: WorkspaceMode;
  tierId?: "fixed";
  creditsPerUnit?: number;
  secondsPerUnit?: number;
}

export const STRIPE_CATALOG: Record<StripePurchaseKey, StripeCatalogItem> = {
  wearable_fixed: {
    key: "wearable_fixed",
    kind: "subscription",
    envKey: "STRIPE_PRICE_WEARABLE_FIXED",
    amountCents: 200_000,
    mode: "wearable",
    tierId: "fixed",
  },
  credits_starter: {
    key: "credits_starter",
    kind: "image_credits",
    envKey: "STRIPE_PRICE_CREDITS_STARTER",
    amountCents: 10_000,
    mode: "wearable",
    creditsPerUnit: 500,
  },
  credits_growth: {
    key: "credits_growth",
    kind: "image_credits",
    envKey: "STRIPE_PRICE_CREDITS_GROWTH",
    amountCents: 25_000,
    mode: "wearable",
    creditsPerUnit: 1_500,
  },
  credits_scale: {
    key: "credits_scale",
    kind: "image_credits",
    envKey: "STRIPE_PRICE_CREDITS_SCALE",
    amountCents: 50_000,
    mode: "wearable",
    creditsPerUnit: 3_300,
  },
  live_minutes: {
    key: "live_minutes",
    kind: "live_tryon_seconds",
    envKey: "STRIPE_PRICE_LIVE_MINUTE",
    amountCents: 120,
    mode: "wearable",
    secondsPerUnit: 60,
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
