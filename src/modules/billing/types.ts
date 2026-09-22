export type PlanTierId = "trial" | "main";

export interface PlanTier {
  id: PlanTierId;
  name: string;
  priceLabel: string;
  priceSub: string;
  /** Included try-on and avatar units for the cycle. A try-on charges one per garment. */
  monthlyGarmentUnits: number;
  monthlyLiveTryOnSeconds: number;
  monthlySessionUnits: number;
  /** Main banks unused include. Trial does not. */
  carriesBalance: boolean;
  description: string;
  bestFor: string;
  features: string[];
}

export interface WalletForecast {
  dailyBurn: number;
  projectedCycleTotal: number;
  suggestedTopUp: number;
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
  overageCents: number;
  overageCapCents: number | null;
  usageAlerts: boolean;
  images: WalletForecast & {
    includedAllowance: number;
    usedThisCycle: number;
    includedRemaining: number;
    creditsBalance: number;
  };
  liveTryOn: WalletForecast & {
    includedAllowanceSeconds: number;
    usedThisCycleSeconds: number;
    includedRemainingSeconds: number;
    purchasedSecondsBalance: number;
    pricePerMinuteCents: number;
  };
  sessions: WalletForecast & {
    includedAllowance: number;
    usedThisCycle: number;
    includedRemaining: number;
    unitsBalance: number;
  };
}
