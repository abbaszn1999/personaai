"use client";

import * as React from "react";
import type { StorePlatform } from "@/modules/store/types";
import { useStoreConnectionStore } from "@/modules/store/store";
import { useWorkspaceStore } from "@/modules/workspaces/store";

interface ConnectForm {
  platform: StorePlatform | null;
  storeUrl: string;
  apiKey: string;
}

const INITIAL_FORM: ConnectForm = { platform: null, storeUrl: "", apiKey: "" };

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

  // Shopify requires a real Admin API access token to connect; other platforms are still simulated.
  const canConnect =
    form.platform !== null &&
    form.storeUrl.trim().length > 3 &&
    (form.platform !== "shopify" || form.apiKey.trim().length > 0);

  async function connect() {
    if (!canConnect) return;
    const ok = await connectStore({
      platform: form.platform!,
      storeUrl: form.storeUrl,
      apiKey: form.apiKey,
    });
    if (ok) setForm(INITIAL_FORM);
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
