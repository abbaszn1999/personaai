"use client";

import { create } from "zustand";
import type {
  StoreConnection,
  StorePlatform,
  StoreCategory,
  CategoryParentMap,
  SkuParentOverrides,
  MerchantTreeNode,
  CatalogSyncState,
  MappingPreviewSample,
  AcsMappingState,
  OptionGroupInfo,
  VariantRole,
} from "@/modules/store/types";
import { DEFAULT_SIZE_TYPE, type SizeType, type SizeTypeOverrides } from "@/lib/sizing/size-types";

/**
 * Everything Setup Stage 1 renders, in one place. Stage 1 used to fetch its own samples with local
 * state while the store held a parallel `mappingPreview` slice for a modal that showed the same
 * table — so "what does my mapping look like" had two answers that could disagree. The modal is
 * gone and this is the only copy.
 */
interface MappingState {
  /** Real products from the merchant's store, mapped through the actual indexer. */
  samples: MappingPreviewSample[];
  /** Option groups discovered live on their catalog, each reassignable to an ACS role. */
  groups: OptionGroupInfo[];
  optionRoles: Record<string, VariantRole>;
  isLoading: boolean;
  hasLoaded: boolean;
  /** Normalized name of the group currently being saved, for a per-row spinner. */
  savingGroup: string | null;
  isApproving: boolean;
  error: string | null;
}

type ConnectInput =
  | { platform: StorePlatform; storeUrl: string; apiKey: string }
  | { platform: StorePlatform; storeUrl: string; clientId: string; clientSecret: string }
  | { platform: StorePlatform; storeUrl: string; wpUsername: string; wpAppPassword: string };

interface StoreConnectionState {
  connection: StoreConnection | null;
  selectedCategoryIds: string[];
  categories: StoreCategory[];
  /** Categories step 2: platform category id to one of the five parent sizing categories. */
  categoryParentMap: CategoryParentMap;
  /** The hierarchy the merchant built by hand. Empty on platforms that publish their own. */
  categoryTree: MerchantTreeNode[];
  /** Stage 2 corrections: product external id to the parent it sizes on, beating its path. */
  skuParentOverrides: SkuParentOverrides;
  /** Doc Part 2: the sizing system this catalog's size labels are written in. */
  storeSizeType: SizeType;
  /** Brand key to sizing system, for brands whose labels differ from the store default. */
  storeSizeTypeOverrides: SizeTypeOverrides;
  productCount: number;
  syncedAt: string | null;
  catalogSync: CatalogSyncState;
  acsMapping: AcsMappingState;
  /** The merchant's soft styling guidance — read by the budget allocator and the stylist's
   *  vision prompt. `null` until a merchant sets one. */
  styleGuide: string | null;
  mapping: MappingState;
  /** False until the first load settles. Anything that gates on connection state needs this:
   *  before it flips, an unloaded store is indistinguishable from having no store at all, and
   *  gating on that flashes a "connect your store" prompt at merchants who already have one. */
  hasLoaded: boolean;
  isLoading: boolean;
  isConnecting: boolean;
  isSyncing: boolean;
  isDisconnecting: boolean;
  connectError: string | null;
  syncError: string | null;
  load: () => Promise<void>;
  connect: (input: ConnectInput) => Promise<boolean>;
  disconnect: () => Promise<boolean>;
  syncNow: () => Promise<void>;
  reindex: () => Promise<void>;
  refreshCatalogSync: () => Promise<void>;
  /** Saves the whole Categories tab in one write: which paths are in scope, which parent sizing
   *  category each was mapped to, and the hierarchy the merchant built to express them. They are
   *  edited as one screen and are only meaningful together — a scope saved without its mapping is a
   *  catalog that indexes and cannot be sized. Does not trigger an index; that is Setup's final
   *  step. */
  saveCategoryScope: (input: {
    selectedCategoryIds: string[];
    categoryParentMap: CategoryParentMap;
    categoryTree?: MerchantTreeNode[];
  }) => Promise<boolean>;
  /** Stage 2: pin one product to a parent, or pass `null` to drop the correction and let it inherit
   *  from its category path again. Optimistic — the row re-renders immediately and rolls back if the
   *  save fails, because this is a per-row control a merchant will use in bursts. */
  setSkuParent: (externalId: string, group: string | null) => Promise<boolean>;
  /** Stage 1, doc Part 2. Saves the store-wide sizing system, its per-brand exceptions, or both.
   *  Optimistic like `setSkuParent`, and for the same reason: these are small controls a merchant
   *  flips several times in a row while reading their own size labels. */
  saveSizeTypes: (input: {
    storeSizeType?: SizeType;
    storeSizeTypeOverrides?: SizeTypeOverrides;
  }) => Promise<boolean>;
  /** Returns `true` on success. `null` clears the style guide. */
  updateStyleGuide: (value: string | null) => Promise<boolean>;
  /** Loads Stage 1's samples and option groups together. Safe to call repeatedly. */
  loadMapping: () => Promise<void>;
  /** Reassigns one option group, or clears the override with `null` to fall back to auto-detect.
   *  Re-reads the samples afterwards so the table shows the mapping it just changed. */
  setOptionRole: (normalized: string, role: VariantRole | null) => Promise<void>;
  approveMapping: () => Promise<boolean>;
}

const IDLE_SYNC: CatalogSyncState = { status: "idle", progress: 0, total: 0 };
const IDLE_MAPPING: AcsMappingState = { approved: false, mapperVersion: 0 };
const IDLE_MAPPING_STATE: MappingState = {
  samples: [],
  groups: [],
  optionRoles: {},
  isLoading: false,
  hasLoaded: false,
  savingGroup: null,
  isApproving: false,
  error: null,
};

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
  categoryParentMap: {},
  categoryTree: [],
  skuParentOverrides: {},
  storeSizeType: DEFAULT_SIZE_TYPE,
  storeSizeTypeOverrides: {},
  productCount: 0,
  syncedAt: null,
  catalogSync: IDLE_SYNC,
  acsMapping: IDLE_MAPPING,
  styleGuide: null,
  mapping: IDLE_MAPPING_STATE,
  hasLoaded: false,
  isLoading: false,
  isConnecting: false,
  isSyncing: false,
  isDisconnecting: false,
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
          categoryParentMap: data.categoryParentMap ?? {},
          categoryTree: data.categoryTree ?? [],
          skuParentOverrides: data.skuParentOverrides ?? {},
          storeSizeType: data.storeSizeType ?? DEFAULT_SIZE_TYPE,
          storeSizeTypeOverrides: data.storeSizeTypeOverrides ?? {},
          productCount: data.productCount ?? 0,
          syncedAt: data.syncedAt ?? null,
          catalogSync: toCatalogSync(data.catalogSync),
          acsMapping: data.acsMapping ?? IDLE_MAPPING,
          styleGuide: data.styleGuide ?? null,
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
        categoryParentMap: data.categoryParentMap ?? {},
        categoryTree: data.categoryTree ?? [],
        skuParentOverrides: data.skuParentOverrides ?? {},
        storeSizeType: data.storeSizeType ?? DEFAULT_SIZE_TYPE,
        storeSizeTypeOverrides: data.storeSizeTypeOverrides ?? {},
        productCount: data.productCount ?? 0,
        syncedAt: data.syncedAt ?? null,
        catalogSync: toCatalogSync(data.catalogSync),
        acsMapping: data.acsMapping ?? IDLE_MAPPING,
        styleGuide: data.styleGuide ?? null,
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
    if (get().isDisconnecting) return false;
    set({ isDisconnecting: true, syncError: null });

    try {
      const res = await fetch("/api/store-connection", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        set({ isDisconnecting: false, syncError: data.error ?? "Failed to disconnect store" });
        return false;
      }

      set({
        connection: null,
        selectedCategoryIds: [],
        categories: [],
        categoryParentMap: {},
        categoryTree: [],
        skuParentOverrides: {},
        storeSizeType: DEFAULT_SIZE_TYPE,
        storeSizeTypeOverrides: {},
        productCount: 0,
        syncedAt: null,
        catalogSync: IDLE_SYNC,
        acsMapping: IDLE_MAPPING,
        styleGuide: null,
        mapping: IDLE_MAPPING_STATE,
        connectError: null,
        syncError: null,
        isDisconnecting: false,
      });
      return true;
    } catch {
      set({ isDisconnecting: false, syncError: "Network error — please try again" });
      return false;
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
      // A `mapping_approval_required` 409 no longer needs special handling: the only place that can
      // start an index is Setup's final step, which is downstream of Stage 1's Approve, so the
      // server's message ("approve in Setup — Stage 1") is already the actionable one.
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

  saveCategoryScope: async ({ selectedCategoryIds, categoryParentMap, categoryTree }) => {
    const res = await fetch("/api/store-connection", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedCategoryIds,
        categoryParentMap,
        ...(categoryTree ? { categoryTree } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return false;
    // Echo back what the server stored rather than what we sent: it drops mappings naming a parent
    // this build no longer has, and those paths need to read as unmapped again straight away.
    set({
      selectedCategoryIds,
      categoryParentMap: data.categoryParentMap ?? categoryParentMap,
      categoryTree: data.categoryTree ?? categoryTree ?? get().categoryTree,
      catalogSync: toCatalogSync(data.catalogSync),
    });
    return true;
  },

  setSkuParent: async (externalId, group) => {
    const previous = get().skuParentOverrides;
    const next = { ...previous };
    if (group) next[externalId] = group;
    else delete next[externalId];

    set({ skuParentOverrides: next });

    try {
      const res = await fetch("/api/store-connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skuParentOverrides: next }),
      });
      if (!res.ok) {
        set({ skuParentOverrides: previous });
        return false;
      }
      const data = await res.json().catch(() => ({}));
      // The server drops entries naming a parent this build no longer has, so its copy wins.
      set({ skuParentOverrides: data.skuParentOverrides ?? next });
      return true;
    } catch {
      set({ skuParentOverrides: previous });
      return false;
    }
  },

  saveSizeTypes: async ({ storeSizeType, storeSizeTypeOverrides }) => {
    const previous = {
      storeSizeType: get().storeSizeType,
      storeSizeTypeOverrides: get().storeSizeTypeOverrides,
    };

    set({
      storeSizeType: storeSizeType ?? previous.storeSizeType,
      storeSizeTypeOverrides: storeSizeTypeOverrides ?? previous.storeSizeTypeOverrides,
    });

    try {
      const res = await fetch("/api/store-connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(storeSizeType !== undefined ? { storeSizeType } : {}),
          ...(storeSizeTypeOverrides !== undefined ? { storeSizeTypeOverrides } : {}),
        }),
      });
      if (!res.ok) {
        set(previous);
        return false;
      }
      const data = await res.json().catch(() => ({}));
      // The server drops overrides naming a system this build does not have, so its copy wins.
      set({
        storeSizeType: data.storeSizeType ?? get().storeSizeType,
        storeSizeTypeOverrides: data.storeSizeTypeOverrides ?? get().storeSizeTypeOverrides,
      });
      return true;
    } catch {
      set(previous);
      return false;
    }
  },

  updateStyleGuide: async (value) => {
    try {
      const res = await fetch("/api/store-connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleGuide: value }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      set({ styleGuide: data.styleGuide ?? null });
      return true;
    } catch {
      return false;
    }
  },

  loadMapping: async () => {
    set((s) => ({ mapping: { ...s.mapping, isLoading: true, error: null } }));
    try {
      // In parallel: the two endpoints are independent, and Stage 1 can't render a useful table
      // without both — the samples show where data lands, the groups say where it may be sent.
      const [previewRes, optionsRes] = await Promise.all([
        fetch("/api/store-connection/mapping-preview"),
        fetch("/api/store-connection/mapping-options"),
      ]);

      const preview = await previewRes.json().catch(() => ({}));
      const options = await optionsRes.json().catch(() => ({}));

      if (!previewRes.ok) {
        set((s) => ({
          mapping: {
            ...s.mapping,
            isLoading: false,
            hasLoaded: true,
            error: preview.error ?? "Could not read a product from your store",
          },
        }));
        return;
      }

      set((s) => ({
        acsMapping: {
          approved: Boolean(preview.alreadyApproved),
          mapperVersion: preview.mapperVersion ?? s.acsMapping.mapperVersion,
        },
        mapping: {
          ...s.mapping,
          samples: preview.samples ?? [],
          // Option-group discovery reads 25 products and can fail on its own (a slow store, a
          // timeout) without making the samples useless, so it degrades to an empty list rather
          // than failing the whole stage.
          groups: optionsRes.ok ? (options.groups ?? []) : [],
          optionRoles: optionsRes.ok ? (options.overrides?.optionRoles ?? {}) : {},
          isLoading: false,
          hasLoaded: true,
          error: null,
        },
      }));
    } catch {
      set((s) => ({
        mapping: { ...s.mapping, isLoading: false, hasLoaded: true, error: "Network error — please try again" },
      }));
    }
  },

  setOptionRole: async (normalized, role) => {
    const nextRoles = { ...get().mapping.optionRoles };
    if (role === null) delete nextRoles[normalized];
    else nextRoles[normalized] = role;

    set((s) => ({ mapping: { ...s.mapping, savingGroup: normalized, error: null } }));

    try {
      const res = await fetch("/api/store-connection/mapping-options", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionRoles: nextRoles }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        set((s) => ({
          mapping: { ...s.mapping, savingGroup: null, error: data.error ?? "Could not save that change" },
        }));
        return;
      }

      const data = await res.json();
      // The save invalidated the approval hash, so reflect that immediately rather than leaving a
      // stale "Approved" badge above a mapping that is no longer the approved one.
      set((s) => ({
        acsMapping: { ...s.acsMapping, approved: false },
        mapping: { ...s.mapping, optionRoles: data.overrides?.optionRoles ?? nextRoles, savingGroup: null },
      }));

      // Re-read the samples so the destination cells show the change. This is what makes the edit
      // verifiable in place: reassigning "Talla" to size moves its values onto the Size row.
      const previewRes = await fetch("/api/store-connection/mapping-preview");
      if (previewRes.ok) {
        const preview = await previewRes.json();
        set((s) => ({ mapping: { ...s.mapping, samples: preview.samples ?? s.mapping.samples } }));
      }
    } catch {
      set((s) => ({ mapping: { ...s.mapping, savingGroup: null, error: "Network error — please try again" } }));
    }
  },

  approveMapping: async () => {
    set((s) => ({ mapping: { ...s.mapping, isApproving: true, error: null } }));
    try {
      const res = await fetch("/api/store-connection/mapping-preview", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        set((s) => ({
          mapping: { ...s.mapping, isApproving: false, error: data.error ?? "Could not record your approval" },
        }));
        return false;
      }
      const data = await res.json();
      set((s) => ({
        acsMapping: { approved: true, mapperVersion: data.mapperVersion ?? s.acsMapping.mapperVersion },
        mapping: { ...s.mapping, isApproving: false },
      }));
      return true;
    } catch {
      set((s) => ({ mapping: { ...s.mapping, isApproving: false, error: "Network error — please try again" } }));
      return false;
    }
  },
}));
