import type { PlanTier, CreditBundle } from "./types";

export const MONTHLY_INCLUDED_RENDERS = 5000;

/** Decart bills by realtime session-seconds, not per-generation, so live camera try-on gets its
 * own included allowance rather than sharing the render cap above. */
export const MONTHLY_INCLUDED_LIVE_TRYON_SECONDS = 100 * 60;
export const LIVE_TRYON_PRICE_PER_MINUTE_CENTS = 120;

export const PLAN_TIERS: PlanTier[] = [
  {
    id: "fixed",
    name: "Fixed Platform Tier",
    priceLabel: "$2,000",
    priceSub: "/month flat fee",
    monthlyRenders: MONTHLY_INCLUDED_RENDERS,
    monthlyLiveTryOnSeconds: MONTHLY_INCLUDED_LIVE_TRYON_SECONDS,
    description: "5,000 high-fidelity 2K renders and 100 live try-on minutes included every month.",
    bestFor: "Ideal for established brands with high, predictable traffic who want to keep 100% of their driven sales revenue.",
    features: [
      "5,000 High-Fidelity 2K Renders / month",
      "100 minutes of Live Camera Try-On / month",
      "Unlimited prompt & reference images",
      "Keep 100% of driven sales revenue",
      "Predictable flat monthly cost",
    ],
  },
  {
    id: "hybrid",
    name: "Hybrid Performance Tier",
    priceLabel: "$500",
    priceSub: "/month base + 10% commission",
    monthlyRenders: MONTHLY_INCLUDED_RENDERS,
    monthlyLiveTryOnSeconds: MONTHLY_INCLUDED_LIVE_TRYON_SECONDS,
    description: "5,000 high-fidelity 2K renders and 100 live try-on minutes included, plus a 10% commission on direct conversions.",
    bestFor: "Perfect for brands wanting a lower upfront entry cost while aligning Autommerce directly with active sales growth.",
    features: [
      "5,000 High-Fidelity 2K Renders / month",
      "100 minutes of Live Camera Try-On / month",
      "Unlimited prompt & reference images",
      "Lower upfront monthly cost",
      "10% commission on direct conversions only",
    ],
    isContactOnly: true,
  },
];

export function getPlanTiers(): PlanTier[] {
  return PLAN_TIERS;
}

export function getPlanTier(tierId: string): PlanTier {
  return PLAN_TIERS.find((tier) => tier.id === tierId) ?? PLAN_TIERS[0];
}

export const CREDIT_BUNDLES: CreditBundle[] = [
  {
    id: "starter",
    name: "Starter Top-Up",
    priceLabel: "$100",
    credits: 500,
    perCreditLabel: "$0.20 / credit",
  },
  {
    id: "growth",
    name: "Growth Top-Up",
    priceLabel: "$250",
    credits: 1500,
    perCreditLabel: "~$0.166 / credit",
  },
  {
    id: "scale",
    name: "Scale Top-Up",
    priceLabel: "$500",
    credits: 3300,
    perCreditLabel: "~$0.151 / credit",
  },
];

export const INFRA_NOTES: string[] = [
  "Conversational chat is included with your plan.",
  "Mannequin & styling generations are managed natively by Autommerce, fixed to studio-grade 2K high-fidelity output.",
  "Unlimited prompt and image input references are included at no extra credit cost — only 2K visual outputs are deducted from your monthly cap.",
];

export function getInfraNotes(): string[] {
  return INFRA_NOTES;
}
