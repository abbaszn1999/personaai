"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Step = "email" | "code" | "password";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Always advance — prevents enumeration
      setStep("code");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/verify-reset-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });

      if (res.ok) {
        setStep("password");
      } else {
        const data = await res.json();
        setError(data.error ?? "Invalid code");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, newPassword }),
      });

      if (res.ok) {
        router.push("/sign-in?reset=1");
      } else {
        const data = await res.json();
        setError(data.error ?? "Password reset failed");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const steps = ["email", "code", "password"] as const;
  const stepIdx = steps.indexOf(step);

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
        <p className="text-[var(--color-text-muted)] text-sm">Reset your password</p>
      </div>

      <div className="panel-glass p-8">
        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  i < stepIdx
                    ? "gradient-brand text-white"
                    : i === stepIdx
                    ? "gradient-brand text-white ring-4 ring-[rgba(247,109,1,0.25)]"
                    : "bg-[rgba(255,255,255,0.06)] text-[var(--color-text-muted)] border border-[rgba(255,255,255,0.1)]"
                }`}
              >
                {i < stepIdx ? (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              {i < steps.length - 1 && (
                <div className={`h-px w-8 transition-all ${i < stepIdx ? "gradient-brand" : "bg-[rgba(255,255,255,0.08)]"}`} />
              )}
            </div>
          ))}
        </div>

        {step === "email" && (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="mb-2">
              <h2 className="text-[var(--color-text-primary)] font-semibold mb-1">Enter your email</h2>
              <p className="text-[var(--color-text-muted)] text-sm">We&apos;ll send you a reset code.</p>
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
            {error && (
              <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] border border-[rgba(225,29,72,0.25)] rounded-[var(--radius-md)] px-3 py-2">
                {error}
              </p>
            )}
            <Button type="submit" size="xl" className="w-full" loading={loading}>
              Send reset code
            </Button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <div className="mb-2">
              <h2 className="text-[var(--color-text-primary)] font-semibold mb-1">Enter reset code</h2>
              <p className="text-[var(--color-text-muted)] text-sm">
                Check your inbox at <span className="text-[var(--color-text-primary)]">{email}</span>.
              </p>
            </div>
            <Input
              label="6-digit code"
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
              Verify code
            </Button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="mb-2">
              <h2 className="text-[var(--color-text-primary)] font-semibold mb-1">Set new password</h2>
              <p className="text-[var(--color-text-muted)] text-sm">Choose a strong password.</p>
            </div>
            <Input
              label="New password"
              type="password"
              placeholder="Min. 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <Input
              label="Confirm password"
              type="password"
              placeholder="Repeat password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            {error && (
              <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] border border-[rgba(225,29,72,0.25)] rounded-[var(--radius-md)] px-3 py-2">
                {error}
              </p>
            )}
            <Button type="submit" size="xl" className="w-full" loading={loading}>
              Reset password
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-[var(--color-text-muted)] mt-6">
          <Link href="/sign-in" className="text-[var(--color-brand)] hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
