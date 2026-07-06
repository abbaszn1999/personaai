"use client";

import * as React from "react";
import type { StorePlatform, StoreConnection } from "@/modules/store/types";
import { useWorkspaceStore } from "@/modules/workspaces/store";

interface ConnectForm {
  platform: StorePlatform | null;
  storeUrl: string;
  apiKey: string;
}

const INITIAL_FORM: ConnectForm = { platform: null, storeUrl: "", apiKey: "" };

export function useStoreConnect() {
  const { workspaces, activeWorkspaceId, updateWorkspace, globalConnection, setGlobalConnection } =
    useWorkspaceStore();
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  const [form, setForm] = React.useState<ConnectForm>(INITIAL_FORM);
  const [isConnecting, setIsConnecting] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncedAt, setSyncedAt] = React.useState<string | null>(null);

  const alreadyConnected = globalConnection?.status === "connected";
  const [productCount, setProductCount] = React.useState(() => alreadyConnected ? 347 : 0);
  const [categoryCount, setCategoryCount] = React.useState(() => alreadyConnected ? 12 : 0);

  function updateForm(patch: Partial<ConnectForm>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  const canConnect = form.platform !== null && form.storeUrl.trim().length > 3;

  async function connect() {
    if (!canConnect) return;
    setIsConnecting(true);
    await new Promise((r) => setTimeout(r, 1600));

    const newConn: StoreConnection = {
      id: `conn-${Date.now()}`,
      platform: form.platform!,
      storeName: form.storeUrl.split(".")[0] ?? "My Store",
      storeUrl: form.storeUrl,
      status: "connected",
      connectedAt: new Date().toISOString(),
    };

    // Set as global connection (account-level)
    setGlobalConnection(newConn);

    // Also update the active workspace so its sidebar footer stays in sync
    if (activeWorkspaceId) {
      updateWorkspace(activeWorkspaceId, { storeConnection: newConn });
    }

    setProductCount(Math.floor(Math.random() * 300) + 50);
    setCategoryCount(Math.floor(Math.random() * 10) + 4);
    setIsConnecting(false);
    setForm(INITIAL_FORM);
  }

  async function disconnect() {
    setGlobalConnection(null);
    if (activeWorkspaceId) {
      updateWorkspace(activeWorkspaceId, { storeConnection: null });
    }
    setProductCount(0);
    setCategoryCount(0);
    setSyncedAt(null);
  }

  async function syncNow() {
    setIsSyncing(true);
    await new Promise((r) => setTimeout(r, 1800));
    setProductCount((c) => c + Math.floor(Math.random() * 5));
    setSyncedAt(new Date().toISOString());
    setIsSyncing(false);
  }

  // Expose the global connection as the primary connection for this page
  const connection = globalConnection;

  return {
    workspace,
    connection,
    form,
    updateForm,
    isConnecting,
    isSyncing,
    canConnect,
    connect,
    disconnect,
    syncNow,
    syncedAt,
    productCount,
    categoryCount,
  };
}
