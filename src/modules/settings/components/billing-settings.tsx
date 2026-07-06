"use client";

import * as React from "react";
import { CreditCard, Crown, Zap, Building2, Check, ArrowRight } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

interface Plan {
  id: string;
  name: string;
  price: string;
  period: string;
  icon: React.ReactNode;
  color: string;
  features: string[];
  cta: string;
  current?: boolean;
}

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "/month",
    icon: <Zap className="h-5 w-5" />,
    color: "text-slate-500",
    features: ["1 workspace", "500 sessions/month", "Basic analytics", "Community support"],
    cta: "Current Plan",
    current: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$49",
    period: "/month",
    icon: <Crown className="h-5 w-5" />,
    color: "text-[var(--color-brand)]",
    features: ["5 workspaces", "10,000 sessions/month", "Full analytics + insights", "Priority support", "Custom branding"],
    cta: "Current Plan",
    current: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    icon: <Building2 className="h-5 w-5" />,
    color: "text-[var(--color-accent)]",
    features: ["Unlimited workspaces", "Unlimited sessions", "Dedicated account manager", "Custom integrations", "SLA guarantee"],
    cta: "Contact Sales",
    current: false,
  },
];

export function BillingSettings() {
  return (
    <SettingsSection
      title="Billing"
      description="Manage your subscription plan and payment details"
      icon={<CreditCard className="h-4 w-4" />}
      accent="brand"
    >
      <div className="space-y-4">
        {/* Current billing summary */}
        <div className="flex items-center justify-between rounded-[var(--radius-xl)] bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center">
              <Crown className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">Pro Plan — Active</p>
              <p className="text-xs text-[var(--color-text-muted)]">Next billing date: August 1, 2026</p>
            </div>
          </div>
          <Button variant="secondary" size="sm">
            Manage Billing
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 gap-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "rounded-[var(--radius-xl)] border p-5 transition-all",
                plan.current
                  ? "border-[var(--color-brand)] bg-[var(--color-brand-light)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-brand)]/40"
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={cn("shrink-0", plan.color)}>{plan.icon}</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-[var(--color-text-primary)]">{plan.name}</p>
                      {plan.current && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-brand)] text-white">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-base font-semibold text-[var(--color-text-primary)] mt-0.5">
                      {plan.price}<span className="text-xs font-normal text-[var(--color-text-muted)]">{plan.period}</span>
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={plan.current ? "secondary" : "primary"}
                  disabled={plan.current}
                >
                  {plan.cta}
                </Button>
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                    <Check className="h-3 w-3 text-[var(--color-success)] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </SettingsSection>
  );
}
