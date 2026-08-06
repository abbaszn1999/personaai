"use client";

import * as React from "react";

interface OpenaiApiKeyState {
  hasKey: boolean;
  maskedKey: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

async function fetchApiKeyStatus(): Promise<{ hasKey: boolean; maskedKey: string | null } | null> {
  try {
    const res = await fetch("/api/account/api-key");
    if (!res.ok) return null;
    const data = await res.json();
    return { hasKey: !!data.hasKey, maskedKey: data.maskedKey ?? null };
  } catch {
    return null;
  }
}

/**
 * Manages the account's OpenAI API key against the real backend.
 * The raw key is only ever sent up (PUT), never fetched back down — the API
 * only returns whether a key is set and a masked preview like "sk-...ab12".
 */
export function useOpenaiApiKey(enabled: boolean = true) {
  const [state, setState] = React.useState<OpenaiApiKeyState>({
    hasKey: false,
    maskedKey: null,
    loading: enabled,
    saving: false,
    error: null,
  });

  React.useEffect(() => {
    // Skipped for the embedded (no-login) try-on page — there's no shopper session for
    // `/api/account/api-key` to check, and a relative fetch there would hit the merchant's
    // own site origin instead of this app's.
    if (!enabled) return;
    let active = true;
    async function load() {
      const result = await fetchApiKeyStatus();
      if (!active) return;
      setState((s) => (result ? { ...s, ...result, loading: false } : { ...s, loading: false }));
    }
    load();
    return () => {
      active = false;
    };
  }, [enabled]);

  async function reload() {
    setState((s) => ({ ...s, loading: true }));
    const result = await fetchApiKeyStatus();
    setState((s) => (result ? { ...s, ...result, loading: false } : { ...s, loading: false }));
  }

  async function save(apiKey: string): Promise<boolean> {
    setState((s) => ({ ...s, saving: true, error: null }));
    try {
      const res = await fetch("/api/account/api-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState((s) => ({ ...s, saving: false, error: data.error ?? "Failed to save API key" }));
        return false;
      }
      setState((s) => ({ ...s, saving: false, hasKey: !!data.hasKey, maskedKey: data.maskedKey ?? null }));
      return true;
    } catch {
      setState((s) => ({ ...s, saving: false, error: "Network error — please try again" }));
      return false;
    }
  }

  async function remove(): Promise<boolean> {
    setState((s) => ({ ...s, saving: true, error: null }));
    try {
      const res = await fetch("/api/account/api-key", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setState((s) => ({ ...s, saving: false, error: data.error ?? "Failed to remove API key" }));
        return false;
      }
      setState((s) => ({ ...s, saving: false, hasKey: false, maskedKey: null }));
      return true;
    } catch {
      setState((s) => ({ ...s, saving: false, error: "Network error — please try again" }));
      return false;
    }
  }

  return { ...state, save, remove, reload };
}
