"use client";

import * as React from "react";
import type { EmbedRuntimeConfig } from "@/modules/wearable-agent/hooks/use-try-on-agent";
import {
  clearEmbedState,
  clearShopperToken,
  getOrCreateEmbedSessionId,
  loadShopperToken,
  resetEmbedSessionId,
  saveShopperToken,
} from "@/lib/embed/client/embed-storage";
import {
  createShopperProfileRemote,
  fetchShopperMe,
  logoutShopper,
  requestShopperCode,
  updateShopperProfileRemote,
  verifyShopperCode,
  type ShopperAccountPublic,
  type ShopperProfileDraft,
  type ShopperProfilePublic,
} from "@/lib/embed/client/shopper-api";

export type ShopperAuthStatus = "loading" | "signed-out" | "ready";

export interface ShopperRuntime {
  status: ShopperAuthStatus;
  account: ShopperAccountPublic | null;
  profiles: ShopperProfilePublic[];
  error: string | null;
  requestCode: (email: string) => Promise<boolean>;
  verifyCode: (email: string, code: string, acceptPrivacy?: boolean) => Promise<{ ok: boolean; privacyRequired?: boolean }>;
  signOut: () => Promise<void>;
  createProfile: (draft: ShopperProfileDraft) => Promise<ShopperProfilePublic | null>;
  updateProfile: (id: string, draft: ShopperProfileDraft) => Promise<ShopperProfilePublic | null>;
}

export function useShopperAuth(embed: EmbedRuntimeConfig): ShopperRuntime {
  const [status, setStatus] = React.useState<ShopperAuthStatus>("loading");
  const [account, setAccount] = React.useState<ShopperAccountPublic | null>(null);
  const [profiles, setProfiles] = React.useState<ShopperProfilePublic[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const tokenRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    // The token lives in localStorage, which doesn't exist during SSR, so the signed-out
    // decision can't be made in the initial state without a hydration mismatch. Resolving it
    // inside an async callback (rather than the effect body) also keeps it off the
    // synchronous render path.
    void (async () => {
      const existing = loadShopperToken(embed.embedToken);
      if (!existing) {
        if (!cancelled) setStatus("signed-out");
        return;
      }
      tokenRef.current = existing;

      const result = await fetchShopperMe(
        embed.apiBase,
        embed.embedToken,
        existing,
        getOrCreateEmbedSessionId(embed.embedToken)
      );
      if (cancelled) return;
      if (!result.ok || !result.body.account) {
        clearShopperToken(embed.embedToken);
        tokenRef.current = null;
        setStatus("signed-out");
        return;
      }
      setAccount(result.body.account);
      setProfiles(result.body.profiles ?? []);
      setStatus("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [embed.apiBase, embed.embedToken]);

  const requestCode = React.useCallback(
    async (email: string) => {
      setError(null);
      const result = await requestShopperCode(embed.apiBase, embed.embedToken, email);
      if (!result.ok) {
        setError(result.body.error || "Couldn't send a code — please try again.");
        return false;
      }
      return true;
    },
    [embed.apiBase, embed.embedToken]
  );

  const verifyCode = React.useCallback(
    async (email: string, code: string, acceptPrivacy?: boolean) => {
      setError(null);
      const result = await verifyShopperCode(embed.apiBase, embed.embedToken, {
        email,
        code,
        acceptPrivacy,
        sessionId: getOrCreateEmbedSessionId(embed.embedToken),
      });
      if (result.body.code === "privacy_required") {
        return { ok: false, privacyRequired: true };
      }
      if (!result.ok || !result.body.token || !result.body.account) {
        setError(result.body.error || "That code didn't work — please try again.");
        return { ok: false };
      }
      saveShopperToken(embed.embedToken, result.body.token);
      tokenRef.current = result.body.token;
      setAccount(result.body.account);
      setProfiles(result.body.profiles ?? []);
      setStatus("ready");
      return { ok: true };
    },
    [embed.apiBase, embed.embedToken]
  );

  const signOut = React.useCallback(async () => {
    const token = tokenRef.current;
    if (token) {
      await logoutShopper(embed.apiBase, embed.embedToken, token).catch(() => undefined);
    }
    tokenRef.current = null;
    clearShopperToken(embed.embedToken);
    clearEmbedState(embed.embedToken);
    resetEmbedSessionId(embed.embedToken);
    setAccount(null);
    setProfiles([]);
    setStatus("signed-out");
  }, [embed.apiBase, embed.embedToken]);

  const createProfile = React.useCallback(
    async (draft: ShopperProfileDraft) => {
      const token = tokenRef.current;
      if (!token) return null;
      const result = await createShopperProfileRemote(embed.apiBase, embed.embedToken, token, draft);
      if (!result.ok || !result.body.profile) return null;
      setProfiles((current) => [...current, result.body.profile!]);
      return result.body.profile;
    },
    [embed.apiBase, embed.embedToken]
  );

  const updateProfile = React.useCallback(
    async (id: string, draft: ShopperProfileDraft) => {
      const token = tokenRef.current;
      if (!token) return null;
      const result = await updateShopperProfileRemote(embed.apiBase, embed.embedToken, token, id, draft);
      if (!result.ok || !result.body.profile) return null;
      setProfiles((current) => current.map((profile) => (profile.id === id ? result.body.profile! : profile)));
      return result.body.profile;
    },
    [embed.apiBase, embed.embedToken]
  );

  return { status, account, profiles, error, requestCode, verifyCode, signOut, createProfile, updateProfile };
}
