"use client";

import * as React from "react";
import type { StorePlatform } from "@/modules/store/types";
import { useStoreConnectionStore } from "@/modules/store/store";
import { useWorkspaceStore } from "@/modules/workspaces/store";

interface ConnectForm {
  platform: StorePlatform | null;
  storeUrl: string;
  apiKey: string;
  clientId: string;
  clientSecret: string;
  wpUsername: string;
  wpAppPassword: string;
}

const INITIAL_FORM: ConnectForm = {
  platform: null,
  storeUrl: "",
  apiKey: "",
  clientId: "",
  clientSecret: "",
  wpUsername: "",
  wpAppPassword: "",
};

/**
 * Bridges the Store page UI to the account-level `useStoreConnectionStore`.
 * `workspace` is only read here for its `mode`, used to pick the mock
 * wearable/unwearable category taxonomy in the Catalog Sync tab.
 */
export function useStoreConnect() {
  const { workspaces, activeWorkspaceId } = useWorkspaceStore();
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  const {
    connection,
    selectedCategoryIds,
    productCount,
    syncedAt,
    isConnecting,
    isSyncing,
    connectError,
    syncError,
    connect: connectStore,
    disconnect: disconnectStore,
    syncNow: syncNowStore,
  } = useStoreConnectionStore();

  const [form, setForm] = React.useState<ConnectForm>(INITIAL_FORM);

  function updateForm(patch: Partial<ConnectForm>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  // Shopify requires a Client ID + Secret from the merchant's own app; WordPress requires an
  // Application Password; other platforms are still simulated.
  const canConnect =
    form.platform !== null &&
    form.storeUrl.trim().length > 3 &&
    (form.platform === "shopify"
      ? form.clientId.trim().length > 0 && form.clientSecret.trim().length > 0
      : form.platform === "wordpress"
        ? form.wpUsername.trim().length > 0 && form.wpAppPassword.trim().length > 0
        : true);

  async function connect(): Promise<boolean> {
    if (!canConnect) return false;
    const ok = await connectStore(
      form.platform === "shopify"
        ? {
            platform: form.platform,
            storeUrl: form.storeUrl,
            clientId: form.clientId,
            clientSecret: form.clientSecret,
          }
        : form.platform === "wordpress"
          ? {
              platform: form.platform,
              storeUrl: form.storeUrl,
              wpUsername: form.wpUsername,
              wpAppPassword: form.wpAppPassword,
            }
          : {
              platform: form.platform!,
              storeUrl: form.storeUrl,
              apiKey: form.apiKey,
            }
    );
    if (ok) setForm(INITIAL_FORM);
    return ok;
  }

  async function disconnect() {
    await disconnectStore();
  }

  async function syncNow() {
    await syncNowStore();
  }

  return {
    workspace,
    connection,
    form,
    updateForm,
    isConnecting,
    isSyncing,
    connectError,
    syncError,
    canConnect,
    connect,
    disconnect,
    syncNow,
    syncedAt,
    productCount,
    categoryCount: selectedCategoryIds.length,
  };
}
