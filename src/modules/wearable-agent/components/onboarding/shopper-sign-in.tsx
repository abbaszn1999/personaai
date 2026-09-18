"use client";

import * as React from "react";
import { ArrowRight, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useWearableBranding } from "../../branding-context";
import { cn } from "@/lib/utils/cn";
import { SAFE_BOTTOM } from "../../mobile-surface";

interface ShopperSignInProps {
  error: string | null;
  onRequestCode: (email: string) => Promise<boolean>;
  onVerifyCode: (
    email: string,
    code: string,
    acceptPrivacy?: boolean
  ) => Promise<{ ok: boolean; privacyRequired?: boolean }>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** First screen of the embedded widget — email, then a 6-digit code. Returning shoppers skip
 *  the privacy checkbox; first-time shoppers see it only if the server says this email is new. */
export function ShopperSignIn({ error, onRequestCode, onVerifyCode }: ShopperSignInProps) {
  const branding = useWearableBranding();
  const [step, setStep] = React.useState<"email" | "code">("email");
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [acceptPrivacy, setAcceptPrivacy] = React.useState(false);
  const [needsPrivacy, setNeedsPrivacy] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const displayError = localError || error;

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setLocalError("Enter a valid email address.");
      return;
    }
    setLocalError(null);
    setBusy(true);
    const ok = await onRequestCode(trimmed);
    setBusy(false);
    if (ok) {
      setEmail(trimmed);
      setStep("code");
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const trimmedCode = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(trimmedCode)) {
      setLocalError("Enter the 6-digit code from your email.");
      return;
    }
    if (needsPrivacy && !acceptPrivacy) {
      setLocalError("Please accept the privacy notice to continue.");
      return;
    }
    setLocalError(null);
    setBusy(true);
    const result = await onVerifyCode(email, trimmedCode, acceptPrivacy || undefined);
    setBusy(false);
    if (result.privacyRequired) {
      setNeedsPrivacy(true);
      setLocalError("Please accept the privacy notice to create your account.");
    }
  }

  return (
    <div className={cn("flex flex-col items-center gap-6 px-6 py-10 text-center", SAFE_BOTTOM)}>
      {branding.logoUrl ? (
        <img src={branding.logoUrl} alt="" className="h-16 w-16 rounded-2xl object-cover shadow-lg" />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl gradient-wearable shadow-lg">
          <Mail className="h-7 w-7 text-white" />
        </div>
      )}
      <div>
        <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">
          {step === "email" ? `Sign in to ${branding.agentName}` : "Check your email"}
        </h2>
        <p className="mt-2 max-w-xs mx-auto text-sm text-[var(--color-text-muted)]">
          {step === "email"
            ? "Save your profiles and pick up where you left off on any device."
            : `We sent a 6-digit code to ${email}.`}
        </p>
      </div>

      {step === "email" ? (
        <form onSubmit={handleSendCode} className="flex w-full max-w-sm flex-col items-stretch gap-4 text-left">
          <Input
            inputSize="touch"
            type="email"
            autoComplete="email"
            inputMode="email"
            label="Email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          {displayError && <p className="text-sm text-[var(--color-error)]">{displayError}</p>}
          <Button type="submit" size="lg" loading={busy} className="gradient-wearable text-white border-0">
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="flex w-full max-w-sm flex-col items-stretch gap-4 text-left">
          <Input
            inputSize="touch"
            inputMode="numeric"
            autoComplete="one-time-code"
            label="Code"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
          />
          {needsPrivacy && (
            <label className="flex items-start gap-2.5 text-sm text-[var(--color-text-secondary)]">
              <input
                type="checkbox"
                checked={acceptPrivacy}
                onChange={(e) => setAcceptPrivacy(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-brand)]"
              />
              <span>
                I agree that my email and measurements are saved for this store so I can reuse my
                profiles. Face photos are used to build an avatar, then discarded — never stored.
                Body measurements are not shown to the store.
              </span>
            </label>
          )}
          {displayError && <p className="text-sm text-[var(--color-error)]">{displayError}</p>}
          <Button
            type="submit"
            size="lg"
            loading={busy}
            disabled={needsPrivacy && !acceptPrivacy}
            className="gradient-wearable text-white border-0"
          >
            Sign in
            <ArrowRight className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setNeedsPrivacy(false);
              setAcceptPrivacy(false);
              setLocalError(null);
            }}
            className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            Use a different email
          </button>
        </form>
      )}
    </div>
  );
}
