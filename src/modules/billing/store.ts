"use client";

import { create } from "zustand";
import type { PlanTierId } from "./types";
import { RENDERS_USED_THIS_CYCLE } from "./mocks/usage-history";
import { CREDIT_BUNDLES } from "./constants";

interface BillingState {
  activeTierId: PlanTierId;
  rendersUsed: number;
  overageCredits: number;
  lastPurchasedBundleId: string | null;
  openaiApiKey: string;
  switchTier: (id: PlanTierId) => void;
  purchaseBundle: (id: string) => void;
  setOpenaiApiKey: (key: string) => void;
}

export const useBillingStore = create<BillingState>((set) => ({
  activeTierId: "fixed",
  rendersUsed: RENDERS_USED_THIS_CYCLE,
  overageCredits: 0,
  lastPurchasedBundleId: null,
  openaiApiKey: "",

  switchTier: (id) => set({ activeTierId: id }),

  purchaseBundle: (id) =>
    set((s) => {
      const bundle = CREDIT_BUNDLES.find((b) => b.id === id);
      if (!bundle) return s;
      return {
        overageCredits: s.overageCredits + bundle.credits,
        lastPurchasedBundleId: id,
      };
    }),

  setOpenaiApiKey: (key) => set({ openaiApiKey: key }),
}));
