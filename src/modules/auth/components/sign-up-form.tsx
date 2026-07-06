"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Step = "register" | "verify";

export function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const verifyParam = searchParams.get("verify");
  const initialEmail = verifyParam ? decodeURIComponent(verifyParam) : "";
  const initialStep: Step = verifyParam ? "verify" : "register";

  const [step, setStep] = useState<Step>(initialStep);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startCooldown() {
    setResendCooldown(60);
    timerRef.current = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, firstName, lastName }),
      });
      const data = await res.json();

      if (res.ok && data.requiresVerification) {
        setStep("verify");
        startCooldown();
        return;
      }

      setError(data.error ?? "Registration failed");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();

      if (res.ok) {
        router.push("/onboarding");
        return;
      }
      setError(data.error ?? "Verification failed");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setError(null);

    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        startCooldown();
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to resend code");
      }
    } catch {
      setError("Network error. Please try again.");
    }
  }

  return (
    <div className="w-full max-w-md animate-fade-in">
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 mb-2">
          <div className="h-8 w-8 rounded-lg gradient-brand flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="text-xl font-bold text-[var(--color-text-primary)]">Autommerce</span>
        </div>
        <p className="text-[var(--color-text-muted)] text-sm">
          {step === "register" ? "Create your account" : "Verify your email"}
        </p>
      </div>

      <div className="panel-glass p-8">
        {step === "register" ? (
          <>
            <a
              href="/api/auth/google"
              className="flex w-full items-center justify-center gap-3 h-10 px-4 rounded-[var(--radius-md)] border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] text-[var(--color-text-primary)] text-sm font-medium hover:bg-[rgba(255,255,255,0.08)] transition-colors mb-6"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </a>

            <div className="flex items-center gap-3 mb-6">
              <div className="h-px flex-1 bg-[rgba(255,255,255,0.08)]" />
              <span className="text-[var(--color-text-muted)] text-xs">or</span>
              <div className="h-px flex-1 bg-[rgba(255,255,255,0.08)]" />
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="First name"
                  placeholder="Jane"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                />
                <Input
                  label="Last name"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                />
              </div>
              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <Input
                label="Password"
                type="password"
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />

              {error && (
                <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] border border-[rgba(225,29,72,0.25)] rounded-[var(--radius-md)] px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" size="xl" className="w-full" loading={loading}>
                Create account
              </Button>
            </form>
          </>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="text-center mb-2">
              <div className="h-12 w-12 rounded-full gradient-brand flex items-center justify-center mx-auto mb-3">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-[var(--color-text-secondary)] text-sm">
                We sent a 6-digit code to
              </p>
              <p className="text-[var(--color-text-primary)] font-medium text-sm mt-0.5">{email}</p>
            </div>

            <Input
              label="Verification code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
              className="text-center text-2xl tracking-widest"
            />

            {error && (
              <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] border border-[rgba(225,29,72,0.25)] rounded-[var(--radius-md)] px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" size="xl" className="w-full" loading={loading}>
              Verify email
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-brand)] disabled:cursor-default transition-colors"
              >
                {resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : "Didn't get the code? Resend"}
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-sm text-[var(--color-text-muted)] mt-6">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-[var(--color-brand)] hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
