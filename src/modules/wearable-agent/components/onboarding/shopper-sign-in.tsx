"use client";

import * as React from "react";
import { ArrowRight, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { OtpInput } from "@/components/ui/otp-input";
import { Button } from "@/components/ui/button";
import type { GoogleSignInResult } from "@/lib/embed/client/google-popup";
import { useWearableBranding } from "../../branding-context";

interface ShopperSignInProps {
  error: string | null;
  onRequestCode: (email: string) => Promise<boolean>;
  onVerifyCode: (
    email: string,
    code: string,
    acceptPrivacy?: boolean
  ) => Promise<{ ok: boolean; privacyRequired?: boolean }>;
  /** Opens Google in a popup. Resolves with a one-time ticket that is redeemed like an emailed code. */
  onGoogle: () => Promise<GoogleSignInResult>;
  /** Starts a one-time visit with no account and nothing saved. */
  onGuest: () => Promise<boolean>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PRIVACY_TEXT =
  "I agree that my email and measurements are saved for this store so I can reuse my profiles. Face photos are used to build an avatar, then discarded — never stored. Body measurements are not shown to the store.";

type Step = "choose" | "code" | "google-privacy";
type Action = "email" | "google" | "guest" | "verify";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

/** First screen of the embedded widget. Three ways in: Google, email with a 6-digit code, or a guest
 *  visit that keeps nothing. Google and email end up in the same place: returning shoppers skip the
 *  privacy checkbox, first-time shoppers see it only if the server says this email is new. */
export function ShopperSignIn({ error, onRequestCode, onVerifyCode, onGoogle, onGuest }: ShopperSignInProps) {
  const branding = useWearableBranding();
  const [step, setStep] = React.useState<Step>("choose");
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [acceptPrivacy, setAcceptPrivacy] = React.useState(false);
  const [needsPrivacy, setNeedsPrivacy] = React.useState(false);
  const [busyAction, setBusyAction] = React.useState<Action | null>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);
  /** The ticket Google gave back, held only while the shopper accepts the privacy notice. */
  const googleTicketRef = React.useRef<string | null>(null);

  const submittingRef = React.useRef(false);

  const busy = busyAction !== null;
  const displayError = localError || error;

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setLocalError("Enter a valid email address.");
      return;
    }
    setLocalError(null);
    setBusyAction("email");
    const ok = await onRequestCode(trimmed);
    setBusyAction(null);
    if (ok) {
      setEmail(trimmed);
      setStep("code");
    }
  }

  async function handleGoogle() {
    if (busy) return;
    setLocalError(null);
    setBusyAction("google");
    try {
      const result = await onGoogle();
      // Closing the window is a choice, not an error.
      if (!result.ok) return;
      const signedIn = await onVerifyCode(result.email, result.ticket);
      if (signedIn.privacyRequired) {
        googleTicketRef.current = result.ticket;
        setEmail(result.email);
        setAcceptPrivacy(false);
        setNeedsPrivacy(true);
        setStep("google-privacy");
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleGoogleConfirm(e: React.FormEvent) {
    e.preventDefault();
    const ticket = googleTicketRef.current;
    if (!ticket || busy) return;
    if (!acceptPrivacy) {
      setLocalError("Please accept the privacy notice to continue.");
      return;
    }
    setLocalError(null);
    setBusyAction("verify");
    try {
      const result = await onVerifyCode(email, ticket, true);
      if (!result.ok && !result.privacyRequired) {
        // The ticket is single use and short lived, so a failure here means starting over.
        googleTicketRef.current = null;
        setNeedsPrivacy(false);
        setStep("choose");
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleGuest() {
    if (busy) return;
    setLocalError(null);
    setBusyAction("guest");
    try {
      await onGuest();
    } finally {
      setBusyAction(null);
    }
  }

  async function submitCode(rawCode: string) {
    const trimmedCode = rawCode.replace(/\s/g, "");
    if (!/^\d{6}$/.test(trimmedCode)) {
      setLocalError("Enter the 6-digit code from your email.");
      return;
    }
    if (needsPrivacy && !acceptPrivacy) {
      setLocalError("Please accept the privacy notice to continue.");
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLocalError(null);
    setBusyAction("verify");
    try {
      const result = await onVerifyCode(email, trimmedCode, acceptPrivacy || undefined);
      if (result.privacyRequired) {
        setNeedsPrivacy(true);
        setLocalError("Please accept the privacy notice to create your account.");
      }
    } finally {
      submittingRef.current = false;
      setBusyAction(null);
    }
  }

  function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    void submitCode(code);
  }

  function backToStart() {
    setStep("choose");
    setCode("");
    setNeedsPrivacy(false);
    setAcceptPrivacy(false);
    setLocalError(null);
    googleTicketRef.current = null;
  }

  const title =
    step === "choose" ? `Sign in to ${branding.agentName}` : step === "code" ? "Check your email" : "One last step";
  const subtitle =
    step === "choose"
      ? branding.signInMessage
      : step === "code"
        ? `We sent a 6-digit code to ${email}.`
        : `Signing in as ${email}.`;

  return (
    <div className="flex flex-col items-center gap-6 px-6 pt-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-center">
      {branding.logoUrl ? (
        <img src={branding.logoUrl} alt="" className="h-16 w-16 rounded-2xl object-cover shadow-lg" />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl gradient-violet shadow-lg">
          <Mail className="h-7 w-7 text-white" />
        </div>
      )}
      <div>
        <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{title}</h2>
        <p className="mt-2 max-w-xs mx-auto text-sm text-[var(--color-text-muted)]">{subtitle}</p>
      </div>

      {step === "choose" && (
        <div className="flex w-full max-w-sm flex-col items-stretch gap-4 text-left">
          <Button
            type="button"
            variant="outline"
            size="lg"
            loading={busyAction === "google"}
            disabled={busy && busyAction !== "google"}
            onClick={() => void handleGoogle()}
          >
            <GoogleMark />
            Continue with Google
          </Button>

          <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-[var(--color-text-muted)]" role="separator">
            <span className="h-px flex-1 bg-[var(--color-border)]" />
            or
            <span className="h-px flex-1 bg-[var(--color-border)]" />
          </div>

          <form onSubmit={handleSendCode} className="flex flex-col items-stretch gap-4">
            <Input
              inputSize="touch"
              type="email"
              autoComplete="email"
              inputMode="email"
              label="Email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {displayError && <p className="text-sm text-[var(--color-error)]">{displayError}</p>}
            <Button
              type="submit"
              size="lg"
              loading={busyAction === "email"}
              disabled={busy && busyAction !== "email"}
              className="gradient-violet text-white border-0"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <div className="flex flex-col items-center gap-1 pt-1 text-center">
            <button
              type="button"
              onClick={() => void handleGuest()}
              disabled={busy}
              className="min-h-11 px-3 text-sm font-medium text-[var(--color-text-secondary)] underline-offset-4 hover:text-[var(--color-text-primary)] hover:underline disabled:opacity-50"
            >
              {busyAction === "guest" ? "Starting…" : "Continue as guest"}
            </button>
            <p className="max-w-xs text-xs text-[var(--color-text-muted)]">
              No account and no saved profiles. Your data is cleared when you leave.
            </p>
          </div>
        </div>
      )}

      {step === "code" && (
        <form onSubmit={handleVerify} className="flex w-full max-w-sm flex-col items-stretch gap-4 text-left">
          <OtpInput
            value={code}
            onChange={(next) => {
              setCode(next);
              if (localError) setLocalError(null);
            }}
            onComplete={(full) => void submitCode(full)}
            disabled={busy}
            autoFocus
            error={Boolean(displayError)}
          />
          {needsPrivacy && (
            <label className="flex items-start gap-2.5 text-sm text-[var(--color-text-secondary)]">
              <input
                type="checkbox"
                checked={acceptPrivacy}
                onChange={(e) => setAcceptPrivacy(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-brand)]"
              />
              <span>{PRIVACY_TEXT}</span>
            </label>
          )}
          {displayError && <p className="text-sm text-[var(--color-error)]">{displayError}</p>}
          <Button
            type="submit"
            size="lg"
            loading={busyAction === "verify"}
            disabled={code.length !== 6 || (needsPrivacy && !acceptPrivacy)}
            className="gradient-violet text-white border-0"
          >
            Sign in
            <ArrowRight className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={backToStart}
            className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            Use a different email
          </button>
        </form>
      )}

      {step === "google-privacy" && (
        <form onSubmit={handleGoogleConfirm} className="flex w-full max-w-sm flex-col items-stretch gap-4 text-left">
          <label className="flex items-start gap-2.5 text-sm text-[var(--color-text-secondary)]">
            <input
              type="checkbox"
              checked={acceptPrivacy}
              onChange={(e) => {
                setAcceptPrivacy(e.target.checked);
                if (localError) setLocalError(null);
              }}
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-brand)]"
            />
            <span>{PRIVACY_TEXT}</span>
          </label>
          {displayError && <p className="text-sm text-[var(--color-error)]">{displayError}</p>}
          <Button
            type="submit"
            size="lg"
            loading={busyAction === "verify"}
            disabled={!acceptPrivacy}
            className="gradient-violet text-white border-0"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={backToStart}
            className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            Use a different account
          </button>
        </form>
      )}
    </div>
  );
}
