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
  setGuestMode,
} from "@/lib/embed/client/embed-storage";
import { signInWithGooglePopup, type GoogleSignInResult } from "@/lib/embed/client/google-popup";
import {
  createShopperProfileRemote,
  deleteShopperProfileRemote,
  fetchShopperMe,
  logoutShopper,
  requestShopperCode,
  startShopperGuest,
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
  /** A one-time visit: no email, no saved profiles, everything gone when the tab closes. */
  isGuest: boolean;
  requestCode: (email: string) => Promise<boolean>;
  verifyCode: (email: string, code: string, acceptPrivacy?: boolean) => Promise<{ ok: boolean; privacyRequired?: boolean }>;
  /** Opens Google in a popup; resolves with a one-time ticket to redeem through `verifyCode`. */
  signInWithGoogle: () => Promise<GoogleSignInResult>;
  continueAsGuest: () => Promise<boolean>;
  signOut: () => Promise<void>;
  createProfile: (draft: ShopperProfileDraft) => Promise<ShopperProfilePublic | null>;
  updateProfile: (id: string, draft: ShopperProfileDraft) => Promise<ShopperProfilePublic | null>;
  deleteProfile: (id: string) => Promise<boolean>;
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
        setGuestMode(embed.embedToken, false);
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
      // A real account always lives on the device, never in a guest tab's storage.
      setGuestMode(embed.embedToken, false);
      saveShopperToken(embed.embedToken, result.body.token);
      tokenRef.current = result.body.token;
      setAccount(result.body.account);
      setProfiles(result.body.profiles ?? []);
      setStatus("ready");
      return { ok: true };
    },
    [embed.apiBase, embed.embedToken]
  );

  const signInWithGoogle = React.useCallback(async () => {
    setError(null);
    const result = await signInWithGooglePopup(embed.apiBase, embed.embedToken);
    if (!result.ok && result.error) setError(result.error);
    return result;
  }, [embed.apiBase, embed.embedToken]);

  const continueAsGuest = React.useCallback(async () => {
    setError(null);
    const result = await startShopperGuest(embed.apiBase, embed.embedToken);
    if (!result.ok || !result.body.token || !result.body.account) {
      setError(result.body.error || "Couldn't start a guest visit. Please try again.");
      return false;
    }
    // Before anything is saved: from here on the token, session id and widget state go to the tab's
    // session storage, so a guest leaves nothing on the device once the tab closes.
    setGuestMode(embed.embedToken, true);
    saveShopperToken(embed.embedToken, result.body.token);
    tokenRef.current = result.body.token;
    setAccount({ ...result.body.account, isGuest: true });
    setProfiles([]);
    setStatus("ready");
    return true;
  }, [embed.apiBase, embed.embedToken]);

  const signOut = React.useCallback(async () => {
    const token = tokenRef.current;
    if (token) {
      await logoutShopper(embed.apiBase, embed.embedToken, token).catch(() => undefined);
    }
    tokenRef.current = null;
    clearShopperToken(embed.embedToken);
    clearEmbedState(embed.embedToken);
    resetEmbedSessionId(embed.embedToken);
    // Last: the clears above have to hit the storage the guest data was actually in.
    setGuestMode(embed.embedToken, false);
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

  const deleteProfile = React.useCallback(
    async (id: string) => {
      const token = tokenRef.current;
      if (!token) return false;
      const result = await deleteShopperProfileRemote(embed.apiBase, embed.embedToken, token, id);
      // A profile the server no longer has is as good as deleted.
      if (!result.ok && result.status !== 404) return false;
      setProfiles((current) => current.filter((profile) => profile.id !== id));
      return true;
    },
    [embed.apiBase, embed.embedToken]
  );

  const isGuest = account?.isGuest === true;

  return {
    status,
    account,
    profiles,
    error,
    isGuest,
    requestCode,
    verifyCode,
    signInWithGoogle,
    continueAsGuest,
    signOut,
    createProfile,
    updateProfile,
    deleteProfile,
  };
}
