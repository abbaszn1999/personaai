"use client";

import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { CreditBundle } from "../types";

interface CreditBundleCardProps {
  bundle: CreditBundle;
  justPurchased: boolean;
  onBuy: () => void;
}

export function CreditBundleCard({ bundle, justPurchased, onBuy }: CreditBundleCardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-xl)] border p-5 flex flex-col gap-3 transition-all",
        justPurchased
          ? "border-[var(--color-success)] bg-[var(--color-success-light)]"
          : "border-[var(--color-border)] hover:border-[var(--color-brand)]/40"
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="h-9 w-9 rounded-lg gradient-brand flex items-center justify-center shrink-0">
          <Coins className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-[var(--color-text-primary)]">{bundle.name}</p>
          <p className="text-xs text-[var(--color-text-muted)]">{bundle.perCreditLabel}</p>
        </div>
      </div>

      <div>
        <p className="text-xl font-display font-extrabold text-[var(--color-text-primary)]">
          {bundle.priceLabel}
        </p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          {bundle.credits.toLocaleString()} credits
        </p>
      </div>

      <Button size="md" variant={justPurchased ? "secondary" : "primary"} onClick={onBuy} className="w-full">
        {justPurchased ? "Added to balance" : "Buy Credits"}
      </Button>
    </div>
  );
}
