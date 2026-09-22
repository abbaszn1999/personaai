import { LIVE_MINUTE_CENTS } from "@/lib/billing/pricing";
import type { PlanTier } from "./types";

export const LIVE_TRYON_PRICE_PER_MINUTE_CENTS = LIVE_MINUTE_CENTS;

/** Trial is first so an unknown stored tier resolves here rather than to Main. */
export const PLAN_TIERS: PlanTier[] = [
  {
    id: "trial",
    name: "Trial",
    priceLabel: "$450",
    priceSub: " / 30 days",
    monthlyGarmentUnits: 12_500,
    monthlyLiveTryOnSeconds: 50 * 60,
    monthlySessionUnits: 50_000,
    carriesBalance: false,
    description: "50,000 session units, 50 live minutes, and 12,500 garment units for 30 days.",
    bestFor: "For a store evaluating Persona before a monthly plan.",
    features: [
      "50,000 session units",
      "50 minutes of live try-on",
      "12,500 garment units",
    ],
  },
  {
    id: "main",
    name: "Main",
    priceLabel: "$1,500",
    priceSub: " / month + 3% of GMV",
    monthlyGarmentUnits: 25_000,
    monthlyLiveTryOnSeconds: 100 * 60,
    monthlySessionUnits: 100_000,
    carriesBalance: true,
    description:
      "100,000 session units, 100 live minutes, and 25,000 garment units every month, plus 3% of GMV sold through Persona.",
    bestFor: "For a store running Persona as its ongoing shopper experience.",
    features: [
      "100,000 session units",
      "100 minutes of live try-on",
      "25,000 garment units",
      "3% of GMV sold through Persona",
    ],
  },
];

export function getPlanTiers(): PlanTier[] {
  return PLAN_TIERS;
}

export function getPlanTier(tierId: string): PlanTier {
  return PLAN_TIERS.find((tier) => tier.id === tierId) ?? PLAN_TIERS[0];
}

export const INFRA_NOTES: string[] = [
  "Session units cover catalog search and conversation, up to the allowance on your plan.",
  "Size chart enrichment, the style guide, and size recommendation are included.",
  "Monthly catalogue sync and the analytics dashboard are included.",
];

export function getInfraNotes(): string[] {
  return INFRA_NOTES;
}
