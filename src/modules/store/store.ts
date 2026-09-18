"use client";

import { create, type StoreApi } from "zustand";
import type {
  StoreConnection,
  StorePlatform,
  StoreCategory,
  SkuParentOverrides,
  CatalogSyncState,
  AcsMappingState,
  CmsColumn,
  SizeChartCoverage,
} from "@/modules/store/types";
import {
  EMPTY_ACS_MAPPING,
  type AcsFieldMapping,
  type CmsColumnRef,
  type CustomAttributeDef,
  type CustomAttributeType,
} from "@/lib/catalog/acs-mapping";
import { DEFAULT_SIZE_SETTINGS, type SizeSettings } from "@/lib/sizing/size-types";
import type { SizingBrand } from "@/lib/sizing/brand-list";

/**
 * Everything Setup Stage 1 renders, in one place. Stage 1 used to fetch its own samples with local
 * state while the store held a parallel `mappingPreview` slice for a modal that showed the same
 * table — so "what does my mapping look like" had two answers that could disagree. The modal is
 * gone and this is the only copy.
 */
interface MappingState {
  /** Every column of the merchant's catalog an ACS field can be bound to, discovered live. */
  columns: CmsColumn[];
  /** Every brand the store knows about, for the Part 2 per-brand sizing exceptions. */
  brands: SizingBrand[];
  /** The saved mapping itself: which column feeds each ACS field, plus declared custom attributes. */
  document: AcsFieldMapping;
  /** How much of the sample carries per-product size charts, once a column is bound to that row. */
  sizeChart: SizeChartCoverage;
  /** How many products the discovery scan read, so the table can qualify its own numbers. */
  sampled: number;
  /** A real sampled product's resolved Persona taxonomy path ("Women > Tops"), for the `categories`
   *  row's sample cell — that row has no CMS column behind it, so its evidence comes from the same
   *  resolution the real index uses instead. Null before anything in the sample resolves anywhere. */
  categoriesSample: string | null;
  /** The full-catalog coverage walk's own state — see `discover-cms-columns.ts`. `idle` means
   *  every column's `presence`/`sampled` above still comes from the 25-product sample alone. */
  discoveryStatus: "idle" | "running" | "done" | "error";
  /** How many products the walk has read so far. Only meaningful while `discoveryStatus` is
   *  `"running"` — a merchant's whole catalog, not the fixed 25 the initial load samples. */
  discoveryScanned: number;
  isLoading: boolean;
  hasLoaded: boolean;
  /** The ACS field key or custom attribute key currently being saved, for a per-row spinner. */
  savingKey: string | null;
  /** True while "Add Custom Attribute" is saving, so the modal can disable its own submit button. */
  isAddingCustomAttribute: boolean;
  isApproving: boolean;
  /** True while `resetFieldMappings` is in flight, for the "Reset Defaults" button's own spinner —
   *  distinct from `isLoading`, which gates the whole stage's initial loading state and would
   *  otherwise flash that message over a table that already has data to show. */
  isResetting: boolean;
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
  /** Stage 2 corrections: product external id to the parent it sizes on, beating its path. */
  skuParentOverrides: SkuParentOverrides;
  /** Doc Part 2: the sizing system this catalog's size labels are written in, plus the brands
   *  whose labels differ from it. */
  storeSizeSettings: SizeSettings;
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
  /** Stage 2: pin one product to a parent, or pass `null` to drop the correction and let it inherit
   *  from its category path again. Optimistic — the row re-renders immediately and rolls back if the
   *  save fails, because this is a per-row control a merchant will use in bursts. */
  setSkuParent: (externalId: string, group: string | null) => Promise<boolean>;
  /** Stage 1, doc Part 2. Saves the store-wide sizing system, its per-brand exceptions, or both.
   *  Optimistic like `setSkuParent`, and for the same reason: these are small controls a merchant
   *  flips several times in a row while reading their own size labels. */
  saveSizeTypes: (input: Partial<SizeSettings>) => Promise<boolean>;
  /** Returns `true` on success. `null` clears the style guide. */
  updateStyleGuide: (value: string | null) => Promise<boolean>;
  /** Loads Stage 1's columns and saved mapping. Safe to call repeatedly. */
  loadMapping: () => Promise<void>;
  /** Starts (or restarts) a full-catalog CMS column coverage walk, then polls it to completion and
   *  reloads the columns with its real numbers — the "Scan full catalog" action in Stage 1's header.
   *  Safe to call again while one is already running; the server treats a second start as a plain
   *  restart. */
  refreshColumnCoverage: () => Promise<void>;
  /** Binds one ACS field to one of the merchant's columns. `null` clears the binding, putting the row
   *  back on auto-mapping — which is not the same as binding it to "unmapped", where the merchant is
   *  saying they want that field left empty. */
  setAcsSource: (acsKey: string, ref: CmsColumnRef | null) => Promise<void>;
  /** Declares a Table 2 custom attribute. Returns an error string on failure (duplicate name, network
   *  error, ...) or `null` on success. */
  addCustomAttribute: (input: { name: string; type: CustomAttributeType; source: CmsColumnRef }) => Promise<string | null>;
  /** Changes a declared attribute's type or bound column. */
  updateCustomAttribute: (key: string, patch: Partial<Pick<CustomAttributeDef, "type" | "source">>) => Promise<boolean>;
  removeCustomAttribute: (key: string) => Promise<boolean>;
  /** Clears the whole saved mapping in one call, restoring Stage 1 to what auto-mapping alone would
   *  produce — the demo's "Reset Defaults" action. */
  resetFieldMappings: () => Promise<boolean>;
  approveMapping: () => Promise<boolean>;
}

const IDLE_SYNC: CatalogSyncState = { status: "idle", progress: 0, total: 0 };
const IDLE_MAPPING: AcsMappingState = { approved: false, mapperVersion: 0 };
const IDLE_MAPPING_STATE: MappingState = {
  columns: [],
  brands: [],
  document: EMPTY_ACS_MAPPING,
  sizeChart: { bound: false, withData: 0, sampled: 0 },
  sampled: 0,
  categoriesSample: null,
  discoveryStatus: "idle",
  discoveryScanned: 0,
  isLoading: false,
  hasLoaded: false,
  savingKey: null,
  isAddingCustomAttribute: false,
  isApproving: false,
  isResetting: false,
  error: null,
};

/**
 * Saves a whole mapping document.
 *
 * One writer for every Stage 1 edit, because they all mean the same thing to the server: the document
 * changed, so the approval hash no longer matches and the gate reopens. Sending the parts that did not
 * change costs nothing and keeps each action from having to know which half the route would preserve.
 */
async function saveAcsMapping(
  next: AcsFieldMapping
): Promise<{ mapping?: AcsFieldMapping; sizeChart?: SizeChartCoverage; error?: string }> {
  try {
    const res = await fetch("/api/store-connection/mapping-options", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sources: next.sources,
        customAttributes: next.customAttributes,
        optionRoles: next.optionRoles,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error ?? "Could not save that change" };
    // `sizeChart` is only present when this save actually moved the size-chart binding — see the
    // route's own comment. Absent means nothing here changed and `mapping.sizeChart` should stay
    // exactly what the last load already put there.
    return { mapping: data.mapping ?? next, sizeChart: data.sizeChart };
  } catch {
    return { error: "Network error — please try again" };
  }
}

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
type SetMappingState = StoreApi<StoreConnectionState>["setState"];
type GetMappingState = StoreApi<StoreConnectionState>["getState"];

/**
 * Polls a full-catalog CMS column walk to completion, then reloads the columns once so
 * `presence`/`sample` pick up the real numbers the walk just wrote (`cms-column-store.ts`).
 *
 * A fixed interval rather than backoff: the walk runs for minutes at best, so there is no idle
 * case here worth economizing on. Shared by `refreshColumnCoverage` (which starts a walk) and
 * `loadMapping` (which resumes polling one that was already running before this page load).
 */
async function pollColumnDiscovery(set: SetMappingState, get: GetMappingState): Promise<void> {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    let status: MappingState["discoveryStatus"] = "error";
    let scanned = 0;
    try {
      const res = await fetch("/api/store-connection/cms-columns/discover");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) break;
      status = data.status ?? "error";
      scanned = data.scanned ?? 0;
    } catch {
      break;
    }

    set((s) => ({ mapping: { ...s.mapping, discoveryStatus: status, discoveryScanned: scanned } }));
    if (status !== "running") break;
  }

  await get().loadMapping();
}

export const useStoreConnectionStore = create<StoreConnectionState>((set, get) => ({
  connection: null,
  selectedCategoryIds: [],
  categories: [],
  skuParentOverrides: {},
  storeSizeSettings: DEFAULT_SIZE_SETTINGS,
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
          skuParentOverrides: data.skuParentOverrides ?? {},
          storeSizeSettings: data.storeSizeSettings ?? DEFAULT_SIZE_SETTINGS,
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
        skuParentOverrides: data.skuParentOverrides ?? {},
        storeSizeSettings: data.storeSizeSettings ?? DEFAULT_SIZE_SETTINGS,
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
        skuParentOverrides: {},
        storeSizeSettings: DEFAULT_SIZE_SETTINGS,
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

  saveSizeTypes: async ({ default: nextDefault, overrides: nextOverrides }) => {
    const previous = get().storeSizeSettings;
    // Merged client-side into the one whole-document field the API now takes — the caller may
    // touch only the default or only the overrides, same independence the two columns used to give
    // for free, just resolved here instead of by the server merging two separate patches.
    const merged: SizeSettings = {
      default: nextDefault ?? previous.default,
      overrides: nextOverrides ?? previous.overrides,
    };

    set({ storeSizeSettings: merged });

    try {
      const res = await fetch("/api/store-connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeSizeSettings: merged }),
      });
      if (!res.ok) {
        set({ storeSizeSettings: previous });
        return false;
      }
      const data = await res.json().catch(() => ({}));
      // The server drops overrides naming a system this build does not have, so its copy wins.
      set({ storeSizeSettings: data.storeSizeSettings ?? merged });
      return true;
    } catch {
      set({ storeSizeSettings: previous });
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
      const [mappingRes, discoveryRes] = await Promise.all([
        fetch("/api/store-connection/mapping-options"),
        // Hydrates a walk already in flight from a previous visit, so a merchant who refreshes
        // mid-scan sees the progress bar resume rather than a state that looks like nothing is
        // happening until they press "Scan" again.
        fetch("/api/store-connection/cms-columns/discover").catch(() => null),
      ]);
      const data = await mappingRes.json().catch(() => ({}));
      const discovery = discoveryRes ? await discoveryRes.json().catch(() => ({})) : {};

      if (!mappingRes.ok) {
        set((s) => ({
          mapping: {
            ...s.mapping,
            isLoading: false,
            hasLoaded: true,
            error: data.error ?? "Could not read your store's columns",
          },
        }));
        return;
      }

      set((s) => ({
        mapping: {
          ...s.mapping,
          columns: data.columns ?? [],
          brands: data.brands ?? [],
          document: data.mapping ?? EMPTY_ACS_MAPPING,
          sizeChart: data.sizeChart ?? s.mapping.sizeChart,
          sampled: data.sampled ?? 0,
          categoriesSample: data.categoriesSample ?? null,
          discoveryStatus: discovery.status ?? s.mapping.discoveryStatus,
          discoveryScanned: discovery.scanned ?? s.mapping.discoveryScanned,
          isLoading: false,
          hasLoaded: true,
          error: null,
        },
      }));

      // A walk was already running before this load — pick its polling back up rather than leaving
      // the merchant to notice it stalled and press "Scan" a second time.
      if (discovery.status === "running") void pollColumnDiscovery(set, get);
    } catch {
      set((s) => ({
        mapping: { ...s.mapping, isLoading: false, hasLoaded: true, error: "Network error — please try again" },
      }));
    }
  },

  refreshColumnCoverage: async () => {
    try {
      const res = await fetch("/api/store-connection/cms-columns/discover", { method: "POST" });
      if (!res.ok) return;
      set((s) => ({ mapping: { ...s.mapping, discoveryStatus: "running", discoveryScanned: 0 } }));
    } catch {
      return;
    }

    await pollColumnDiscovery(set, get);
  },

  setAcsSource: async (acsKey, ref) => {
    const current = get().mapping.document;
    const sources = { ...current.sources };
    if (ref === null) delete sources[acsKey];
    else sources[acsKey] = ref;
    const next: AcsFieldMapping = { ...current, sources };

    // Applied before the round trip so the dropdown reflects the click immediately; the response
    // replaces it with whatever the server actually stored.
    set((s) => ({ mapping: { ...s.mapping, document: next, savingKey: acsKey, error: null } }));

    const result = await saveAcsMapping(next);
    if (result.error) {
      set((s) => ({ mapping: { ...s.mapping, document: current, savingKey: null, error: result.error ?? null } }));
      return;
    }

    // The save invalidated the approval hash, so reflect that immediately rather than leaving a stale
    // "Approved" badge above a mapping that is no longer the approved one.
    set((s) => ({
      acsMapping: { ...s.acsMapping, approved: false },
      mapping: {
        ...s.mapping,
        document: result.mapping ?? next,
        sizeChart: result.sizeChart ?? s.mapping.sizeChart,
        savingKey: null,
      },
    }));
  },

  addCustomAttribute: async ({ name, type, source }) => {
    const trimmed = name.trim();
    if (!trimmed) return "Give the attribute a name";

    const current = get().mapping.document;
    // Compared on the sanitized key rather than the name, because that is what would actually
    // collide: "Heel Height" and "heel height" are one ACS attribute however differently they read.
    const key = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_|_$/g, "");
    if (!key) return "Use at least one letter or number in the name";
    if (current.customAttributes.some((attribute) => attribute.key === key)) {
      return `"${trimmed}" already has a row in the mapping table`;
    }

    const next: AcsFieldMapping = {
      ...current,
      customAttributes: [...current.customAttributes, { key, name: trimmed, type, source }],
    };

    set((s) => ({ mapping: { ...s.mapping, isAddingCustomAttribute: true, error: null } }));

    const result = await saveAcsMapping(next);
    if (result.error) {
      set((s) => ({ mapping: { ...s.mapping, isAddingCustomAttribute: false } }));
      return result.error;
    }

    set((s) => ({
      acsMapping: { ...s.acsMapping, approved: false },
      mapping: { ...s.mapping, document: result.mapping ?? next, isAddingCustomAttribute: false },
    }));
    return null;
  },

  updateCustomAttribute: async (key, patch) => {
    const current = get().mapping.document;
    if (!current.customAttributes.some((attribute) => attribute.key === key)) return false;

    const next: AcsFieldMapping = {
      ...current,
      customAttributes: current.customAttributes.map((attribute) =>
        attribute.key === key ? { ...attribute, ...patch } : attribute
      ),
    };

    set((s) => ({ mapping: { ...s.mapping, document: next, savingKey: key, error: null } }));

    const result = await saveAcsMapping(next);
    if (result.error) {
      set((s) => ({ mapping: { ...s.mapping, document: current, savingKey: null, error: result.error ?? null } }));
      return false;
    }

    set((s) => ({
      acsMapping: { ...s.acsMapping, approved: false },
      mapping: { ...s.mapping, document: result.mapping ?? next, savingKey: null },
    }));
    return true;
  },

  removeCustomAttribute: async (key) => {
    const current = get().mapping.document;
    const next: AcsFieldMapping = {
      ...current,
      customAttributes: current.customAttributes.filter((attribute) => attribute.key !== key),
    };

    set((s) => ({ mapping: { ...s.mapping, document: next, savingKey: key, error: null } }));

    const result = await saveAcsMapping(next);
    if (result.error) {
      set((s) => ({ mapping: { ...s.mapping, document: current, savingKey: null, error: result.error ?? null } }));
      return false;
    }

    set((s) => ({
      acsMapping: { ...s.acsMapping, approved: false },
      mapping: { ...s.mapping, document: result.mapping ?? next, savingKey: null },
    }));
    return true;
  },

  resetFieldMappings: async () => {
    set((s) => ({ mapping: { ...s.mapping, isResetting: true, error: null } }));

    // Sending every part explicitly empty — rather than omitting them — is what makes this a reset
    // rather than a no-op: the route only replaces a part it receives.
    const result = await saveAcsMapping(EMPTY_ACS_MAPPING);
    if (result.error) {
      set((s) => ({ mapping: { ...s.mapping, isResetting: false, error: result.error ?? null } }));
      return false;
    }

    set((s) => ({
      acsMapping: { ...s.acsMapping, approved: false },
      mapping: {
        ...s.mapping,
        document: result.mapping ?? EMPTY_ACS_MAPPING,
        sizeChart: result.sizeChart ?? s.mapping.sizeChart,
        isResetting: false,
      },
    }));
    return true;
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
