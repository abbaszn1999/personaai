export type PlanTierId = "fixed" | "hybrid";

export interface PlanTier {
  id: PlanTierId;
  name: string;
  priceLabel: string;
  priceSub: string;
  monthlyRenders: number;
  description: string;
  bestFor: string;
  features: string[];
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
