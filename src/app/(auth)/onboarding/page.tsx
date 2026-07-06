"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

interface Step {
  id: string;
  title: string;
  description: string;
  options: { value: string; label: string; emoji: string }[];
}

const STEPS: Step[] = [
  {
    id: "role",
    title: "What's your role?",
    description: "Tell us how you'll be using Autommerce.",
    options: [
      { value: "store_owner", label: "Store Owner", emoji: "🏪" },
      { value: "marketing_manager", label: "Marketing Manager", emoji: "📣" },
      { value: "developer", label: "Developer", emoji: "💻" },
      { value: "agency", label: "Agency", emoji: "🏢" },
      { value: "other", label: "Other", emoji: "✨" },
    ],
  },
  {
    id: "platform",
    title: "What platform are you on?",
    description: "We'll tailor the experience to your stack.",
    options: [
      { value: "shopify", label: "Shopify", emoji: "🛍️" },
      { value: "woocommerce", label: "WooCommerce", emoji: "🔌" },
      { value: "custom", label: "Custom / Headless", emoji: "⚙️" },
      { value: "not_launched", label: "Not launched yet", emoji: "🚀" },
    ],
  },
  {
    id: "mainGoal",
    title: "What's your main goal?",
    description: "We'll focus on what matters most to you.",
    options: [
      { value: "boost_conversions", label: "Boost conversions", emoji: "📈" },
      { value: "reduce_returns", label: "Reduce returns", emoji: "📦" },
      { value: "product_discovery", label: "Improve product discovery", emoji: "🔍" },
      { value: "all_above", label: "All of the above", emoji: "🎯" },
    ],
  },
  {
    id: "catalogSize",
    title: "How big is your catalog?",
    description: "This helps us optimize performance for you.",
    options: [
      { value: "1_50", label: "1–50 products", emoji: "🌱" },
      { value: "51_500", label: "51–500 products", emoji: "🌿" },
      { value: "500_plus", label: "500+ products", emoji: "🌳" },
      { value: "still_building", label: "Still building", emoji: "🔨" },
    ],
  },
  {
    id: "monthlyTraffic",
    title: "What's your monthly traffic?",
    description: "Helps us scale recommendations to your volume.",
    options: [
      { value: "under_1k", label: "Under 1,000 visitors", emoji: "🌅" },
      { value: "1k_10k", label: "1,000–10,000 visitors", emoji: "🌇" },
      { value: "10k_plus", label: "10,000+ visitors", emoji: "🏙️" },
      { value: "not_live", label: "Not live yet", emoji: "⏳" },
    ],
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const step = STEPS[currentStep];
  const selected = answers[step.id];
  const isLast = currentStep === STEPS.length - 1;

  async function handleSelect(value: string) {
    const newAnswers = { ...answers, [step.id]: value };
    setAnswers(newAnswers);

    if (!isLast) {
      setTimeout(() => setCurrentStep((s) => s + 1), 150);
    }
    // On the last step, user must click "Finish setup" to submit
  }

  async function handleFinish() {
    if (loading || !selected) return;

    const finalAnswers = { ...answers, [step.id]: selected };
    setLoading(true);
    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalAnswers),
      });

      if (res.ok) {
        router.push("/");
      } else {
        const data = await res.json();
        console.error("[onboarding]", data.error);
        router.push("/");
      }
    } catch (err) {
      console.error("[onboarding]", err);
      router.push("/");
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  }

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <div className="w-full max-w-lg animate-fade-in">
      {/* Logo + progress */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 mb-6">
          <div className="h-8 w-8 rounded-lg gradient-brand flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="text-xl font-bold text-[var(--color-text-primary)]">Autommerce</span>
        </div>

        {/* Progress bar */}
        <div className="relative h-1 bg-[rgba(255,255,255,0.08)] rounded-full overflow-hidden mb-3">
          <div
            className="absolute left-0 top-0 h-full gradient-brand rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[var(--color-text-muted)] text-xs">
          Step {currentStep + 1} of {STEPS.length}
        </p>
      </div>

      <div className="panel-glass p-8">
        <div className="mb-6 animate-fade-in" key={step.id}>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-1">{step.title}</h2>
          <p className="text-[var(--color-text-muted)] text-sm">{step.description}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 animate-fade-in" key={`opts-${step.id}`}>
          {step.options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={loading}
              onClick={() => handleSelect(opt.value)}
              className={cn(
                "flex items-center gap-4 w-full text-left px-4 py-3.5 rounded-[var(--radius-lg)] border transition-all duration-200",
                selected === opt.value
                  ? "border-[var(--color-brand)] bg-[rgba(247,109,1,0.1)] text-[var(--color-text-primary)]"
                  : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[var(--color-text-secondary)] hover:border-[rgba(255,255,255,0.16)] hover:bg-[rgba(255,255,255,0.06)]"
              )}
            >
              <span className="text-2xl">{opt.emoji}</span>
              <span className="font-medium text-sm">{opt.label}</span>
              {selected === opt.value && (
                <span className="ml-auto h-5 w-5 rounded-full gradient-brand flex items-center justify-center shrink-0">
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              )}
            </button>
          ))}
        </div>

        {currentStep > 0 && (
          <button
            type="button"
            onClick={handleBack}
            className="mt-6 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors flex items-center gap-1"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        )}

        {isLast && selected && (
          <Button
            className="w-full mt-4"
            size="xl"
            loading={loading}
            onClick={handleFinish}
          >
            Finish setup
          </Button>
        )}
      </div>
    </div>
  );
}
