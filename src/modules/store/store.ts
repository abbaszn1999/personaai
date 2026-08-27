"use client";

import { create } from "zustand";
import type {
  StoreConnection,
  StorePlatform,
  StoreCategory,
  CatalogSyncState,
  MappingPreviewSample,
  AcsMappingState,
} from "@/modules/store/types";

type ConnectInput =
  | { platform: StorePlatform; storeUrl: string; apiKey: string }
  | { platform: StorePlatform; storeUrl: string; clientId: string; clientSecret: string }
  | { platform: StorePlatform; storeUrl: string; wpUsername: string; wpAppPassword: string };

interface StoreConnectionState {
  connection: StoreConnection | null;
  selectedCategoryIds: string[];
  categories: StoreCategory[];
  productCount: number;
  syncedAt: string | null;
  catalogSync: CatalogSyncState;
  acsMapping: AcsMappingState;
  mappingPreview: {
    isOpen: boolean;
    isLoading: boolean;
    samples: MappingPreviewSample[];
    error: string | null;
    /** The category selection the preview (and the save it's gating) is for — replayed once the
     *  merchant approves, so approving doesn't require them to press Save a second time. Mutually
     *  exclusive with `pendingReindex`: a save and a manual reindex are the two different actions
     *  that can open this modal, never both at once. */
    pendingCategoryIds: string[] | null;
    /** True when a manual Re-index (rather than a category save) is what triggered this preview —
     *  approving should retry the reindex, not replay a category save that never happened. */
    pendingReindex: boolean;
  };
  /** False until the first load settles. Anything that gates on connection state needs this:
   *  before it flips, an unloaded store is indistinguishable from having no store at all, and
   *  gating on that flashes a "connect your store" prompt at merchants who already have one. */
  hasLoaded: boolean;
  isLoading: boolean;
  isConnecting: boolean;
  isSyncing: boolean;
  connectError: string | null;
  syncError: string | null;
  load: () => Promise<void>;
  connect: (input: ConnectInput) => Promise<boolean>;
  disconnect: () => Promise<void>;
  syncNow: () => Promise<void>;
  reindex: () => Promise<void>;
  refreshCatalogSync: () => Promise<void>;
  /** Returns `"ok"` on success, `"needs_approval"` when the server blocked the save pending
   *  mapping approval (the caller should open the preview modal, not treat it as a hard error). */
  updateSelectedCategories: (ids: string[]) => Promise<"ok" | "needs_approval" | "error">;
  openMappingPreview: (categoryIds: string[], options?: { pendingReindex?: boolean }) => Promise<void>;
  closeMappingPreview: () => void;
  approveMappingPreview: () => Promise<boolean>;
}

const IDLE_SYNC: CatalogSyncState = { status: "idle", progress: 0, total: 0 };
const IDLE_MAPPING: AcsMappingState = { approved: false, mapperVersion: 0 };

function toCatalogSync(value: unknown): CatalogSyncState {
  if (!value || typeof value !== "object") return IDLE_SYNC;
  const raw = value as Partial<CatalogSyncState>;
  return {
    status: raw.status ?? "idle",
    progress: raw.progress ?? 0,
    total: raw.total ?? 0,
  };
}

/**
 * Account-level store connection (platform, credentials, sync state, and the
 * categories selected for the agent). Backed by the single `store_connections`
 * row for this account — see `/api/store-connection`. For Shopify and
 * WordPress, `connect` and `syncNow` hit the real Admin/WooCommerce REST
 * APIs; other platforms remain simulated.
 */
export const useStoreConnectionStore = create<StoreConnectionState>((set, get) => ({
  connection: null,
  selectedCategoryIds: [],
  categories: [],
  productCount: 0,
  syncedAt: null,
  catalogSync: IDLE_SYNC,
  acsMapping: IDLE_MAPPING,
  mappingPreview: {
    isOpen: false,
    isLoading: false,
    samples: [],
    error: null,
    pendingCategoryIds: null,
    pendingReindex: false,
  },
  hasLoaded: false,
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
          catalogSync: toCatalogSync(data.catalogSync),
          acsMapping: data.acsMapping ?? IDLE_MAPPING,
          isLoading: false,
          hasLoaded: true,
        });
      } else {
        set({ isLoading: false, hasLoaded: true });
      }
    } catch {
      set({ isLoading: false, hasLoaded: true });
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
        catalogSync: toCatalogSync(data.catalogSync),
        acsMapping: data.acsMapping ?? IDLE_MAPPING,
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
      set({
        connection: null,
        selectedCategoryIds: [],
        categories: [],
        productCount: 0,
        syncedAt: null,
        catalogSync: IDLE_SYNC,
        acsMapping: IDLE_MAPPING,
        connectError: null,
      });
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

  /**
   * Queues the catalog walk again. The work itself runs out-of-band, so this
   * only flips the status to `pending` — progress arrives via polling.
   */
  reindex: async () => {
    set({ syncError: null });
    try {
      const res = await fetch("/api/store-connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reindex: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        set({ catalogSync: toCatalogSync(data.catalogSync) });
        return;
      }
      // Same "not a failure" treatment `updateSelectedCategories` gives this — a mapper version
      // bump (or a first-time reindex) means the merchant just hasn't approved the current
      // mapping yet. Opening the modal here means approving retries this exact reindex, rather
      // than leaving the merchant stuck on a generic error with no path forward.
      if (res.status === 409 && data.code === "mapping_approval_required") {
        await get().openMappingPreview(get().selectedCategoryIds, { pendingReindex: true });
        return;
      }
      set({ syncError: data.error ?? "Failed to start indexing" });
    } catch {
      set({ syncError: "Network error — please try again" });
    }
  },

  refreshCatalogSync: async () => {
    try {
      const res = await fetch("/api/store-connection");
      if (!res.ok) return;
      const data = await res.json();
      set({
        catalogSync: toCatalogSync(data.catalogSync),
        productCount: data.productCount ?? get().productCount,
      });
    } catch {
      // A dropped poll is not worth surfacing; the next tick will retry.
    }
  },

  updateSelectedCategories: async (ids) => {
    const res = await fetch("/api/store-connection", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedCategoryIds: ids }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // The server blocks a first-time (or category-addition) backfill until the mapping preview
      // is approved — this is expected, not a failure, so the caller opens the modal instead of
      // showing a generic error.
      if (res.status === 409 && data.code === "mapping_approval_required") return "needs_approval";
      return "error";
    }
    // The response already reflects the sync status this save just triggered (e.g. flipped to
    // "pending"). Applying it here — rather than just the ids — is what lets the status card
    // start polling immediately instead of sitting stale until the next full page load.
    set({ selectedCategoryIds: ids, catalogSync: toCatalogSync(data.catalogSync) });
    return "ok";
  },

  openMappingPreview: async (categoryIds, options = {}) => {
    const pendingReindex = options.pendingReindex ?? false;
    set({
      mappingPreview: {
        isOpen: true,
        isLoading: true,
        samples: [],
        error: null,
        // A reindex-triggered open has nothing to replay via `updateSelectedCategories` — the
        // selection didn't change, only approval was missing — so it's `pendingReindex` instead.
        pendingCategoryIds: pendingReindex ? null : categoryIds,
        pendingReindex,
      },
    });
    try {
      const res = await fetch(`/api/store-connection/mapping-preview?categoryIds=${categoryIds.join(",")}`);
      const data = await res.json();
      if (!res.ok) {
        set((s) => ({ mappingPreview: { ...s.mappingPreview, isLoading: false, error: data.error ?? "Failed to build preview" } }));
        return;
      }
      set((s) => ({ mappingPreview: { ...s.mappingPreview, isLoading: false, samples: data.samples ?? [] } }));
    } catch {
      set((s) => ({ mappingPreview: { ...s.mappingPreview, isLoading: false, error: "Network error — please try again" } }));
    }
  },

  closeMappingPreview: () => {
    set({
      mappingPreview: {
        isOpen: false,
        isLoading: false,
        samples: [],
        error: null,
        pendingCategoryIds: null,
        pendingReindex: false,
      },
    });
  },

  /** Approves, then replays whichever action triggered the preview — a category save or a manual
   *  reindex — so the merchant doesn't have to press that button a second time. */
  approveMappingPreview: async () => {
    const { pendingCategoryIds, pendingReindex } = get().mappingPreview;
    try {
      const res = await fetch("/api/store-connection/mapping-preview", { method: "POST" });
      if (!res.ok) return false;
      const data = await res.json();
      set({ acsMapping: { approved: true, mapperVersion: data.mapperVersion } });
      get().closeMappingPreview();

      if (pendingReindex) {
        await get().reindex();
        return get().syncError === null;
      }
      if (pendingCategoryIds) {
        const outcome = await get().updateSelectedCategories(pendingCategoryIds);
        return outcome === "ok";
      }
      return true;
    } catch {
      return false;
    }
  },
}));
