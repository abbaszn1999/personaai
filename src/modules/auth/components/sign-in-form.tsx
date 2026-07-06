"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function getInitialError(errorParam: string | null): string | null {
  if (errorParam === "google_cancelled") return "Google sign-in was cancelled.";
  if (errorParam === "google_csrf") return "Security check failed. Please try again.";
  if (errorParam === "google_failed") return "Google sign-in failed. Please try again.";
  return null;
}

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() => getInitialError(searchParams.get("error")));
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (res.ok) {
        const dest = data.user?.hasCompletedOnboarding ? "/" : "/onboarding";
        router.push(dest);
        return;
      }

      if (res.status === 401 && data.useGoogle) {
        setError("This account uses Google sign-in. Please use the button below.");
        return;
      }

      if (res.status === 403 && data.requiresVerification) {
        setNeedsVerification(true);
        setError("Please verify your email first. A new code has been sent.");
        return;
      }

      setError(data.error ?? "Sign-in failed");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
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
        <p className="text-[var(--color-text-muted)] text-sm">Sign in to your account</p>
      </div>

      <div className="panel-glass p-8">
        {/* Google Sign-In */}
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

        <form onSubmit={handleSubmit} className="space-y-4">
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
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          {error && (
            <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] border border-[rgba(225,29,72,0.25)] rounded-[var(--radius-md)] px-3 py-2">
              {error}
            </p>
          )}

          {needsVerification && (
            <p className="text-xs text-[var(--color-text-muted)]">
              Didn&apos;t get the code?{" "}
              <Link href={`/sign-up?verify=${encodeURIComponent(email)}`} className="text-[var(--color-brand)] hover:underline">
                Go to verification
              </Link>
            </p>
          )}

          <div className="flex items-center justify-end">
            <Link
              href="/forgot-password"
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-brand)] transition-colors"
            >
              Forgot password?
            </Link>
          </div>

          <Button type="submit" size="xl" className="w-full" loading={loading}>
            Sign in
          </Button>
        </form>

        <p className="text-center text-sm text-[var(--color-text-muted)] mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/sign-up" className="text-[var(--color-brand)] hover:underline font-medium">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
