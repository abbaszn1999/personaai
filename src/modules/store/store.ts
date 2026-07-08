"use client";

import { create } from "zustand";
import type { StoreConnection, StorePlatform, StoreCategory } from "@/modules/store/types";

interface ConnectInput {
  platform: StorePlatform;
  storeUrl: string;
  apiKey: string;
}

interface StoreConnectionState {
  connection: StoreConnection | null;
  selectedCategoryIds: string[];
  categories: StoreCategory[];
  productCount: number;
  syncedAt: string | null;
  isLoading: boolean;
  isConnecting: boolean;
  isSyncing: boolean;
  connectError: string | null;
  syncError: string | null;
  load: () => Promise<void>;
  connect: (input: ConnectInput) => Promise<boolean>;
  disconnect: () => Promise<void>;
  syncNow: () => Promise<void>;
  updateSelectedCategories: (ids: string[]) => Promise<boolean>;
}

/**
 * Account-level store connection (platform, credentials, sync state, and the
 * categories selected for the agent). Backed by the single `store_connections`
 * row for this account — see `/api/store-connection`. For Shopify, `connect`
 * and `syncNow` hit the real Admin API; other platforms remain simulated.
 */
export const useStoreConnectionStore = create<StoreConnectionState>((set, get) => ({
  connection: null,
  selectedCategoryIds: [],
  categories: [],
  productCount: 0,
  syncedAt: null,
  isLoading: false,
  isConnecting: false,
  isSyncing: false,
  connectError: null,
  syncError: null,

  load: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch("/api/store-connection");
      if (res.ok) {
        const data = await res.json();
        set({
          connection: data.connection ?? null,
          selectedCategoryIds: data.selectedCategoryIds ?? [],
          categories: data.categories ?? [],
          productCount: data.productCount ?? 0,
          syncedAt: data.syncedAt ?? null,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  connect: async (input) => {
    set({ isConnecting: true, connectError: null });
    try {
      const res = await fetch("/api/store-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) {
        set({ isConnecting: false, connectError: data.error ?? "Failed to connect store" });
        return false;
      }
      set({
        connection: data.connection ?? null,
        selectedCategoryIds: data.selectedCategoryIds ?? [],
        categories: data.categories ?? [],
        productCount: data.productCount ?? 0,
        syncedAt: data.syncedAt ?? null,
        isConnecting: false,
        connectError: null,
      });
      return true;
    } catch {
      set({ isConnecting: false, connectError: "Network error — please try again" });
      return false;
    }
  },

  disconnect: async () => {
    try {
      await fetch("/api/store-connection", { method: "DELETE" });
    } finally {
      set({ connection: null, selectedCategoryIds: [], categories: [], productCount: 0, syncedAt: null, connectError: null });
    }
  },

  syncNow: async () => {
    set({ isSyncing: true, syncError: null });
    try {
      const res = await fetch("/api/store-connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sync: true }),
      });
      const data = await res.json();
      if (res.ok) {
        set({
          categories: data.categories ?? get().categories,
          productCount: data.productCount ?? get().productCount,
          syncedAt: data.syncedAt ?? null,
          isSyncing: false,
        });
      } else {
        set({ isSyncing: false, syncError: data.error ?? "Failed to sync" });
      }
    } catch {
      set({ isSyncing: false, syncError: "Network error — please try again" });
    }
  },

  updateSelectedCategories: async (ids) => {
    const res = await fetch("/api/store-connection", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedCategoryIds: ids }),
    });
    if (!res.ok) return false;
    set({ selectedCategoryIds: ids });
    return true;
  },
}));
