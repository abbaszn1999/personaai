export type PlanTierId = "fixed" | "hybrid";

export interface PlanTier {
  id: PlanTierId;
  name: string;
  priceLabel: string;
  priceSub: string;
  monthlyRenders: number;
  monthlyLiveTryOnSeconds: number;
  description: string;
  bestFor: string;
  features: string[];
  /** True when this tier requires a manually-negotiated contract — no self-service "switch to this plan". */
  isContactOnly?: boolean;
}

export interface CreditBundle {
  id: string;
  name: string;
  priceLabel: string;
  credits: number;
  perCreditLabel: string;
}

export interface UsagePoint {
  date: string;
  renders: number;
}

export interface LiveTryOnUsagePoint {
  date: string;
  seconds: number;
}

export interface BillingSummary {
  tierId: PlanTierId;
  cycleStart: string;
  cycleEnd: string;
  billing: {
    accessMode: "stripe" | "legacy_test";
    entitlementStatus:
      | "legacy_test"
      | "active"
      | "trialing"
      | "past_due_grace"
      | "past_due"
      | "inactive";
    entitled: boolean;
    hasStripeCustomer: boolean;
    subscriptionStatus: string | null;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
  };
  images: {
    includedAllowance: number;
    usedThisCycle: number;
    includedRemaining: number;
    creditsBalance: number;
  };
  liveTryOn: {
    includedAllowanceSeconds: number;
    usedThisCycleSeconds: number;
    includedRemainingSeconds: number;
    purchasedSecondsBalance: number;
    pricePerMinuteCents: number;
  };
  chatMessagesThisCycle: number;
}
