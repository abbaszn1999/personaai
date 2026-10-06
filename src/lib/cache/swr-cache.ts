import { loadSnapshot, saveSnapshot } from "./snapshot-store";

/**
 * Stale-while-revalidate cache for the setup pipeline's expensive, whole-catalog snapshots.
 *
 * Three rules make it safe to serve cached data:
 * - Every entry carries the fingerprint of the inputs it was built from. A caller passes the current
 *   fingerprint, so a changed mapping, chart or publish is noticed on the very next request even when
 *   the code that changed it never called `invalidate`.
 * - `swr` answers instantly from the last good entry when only its age (or an explicit invalidation)
 *   is against it, and rebuilds in the background, reporting `refreshing` so the screen can say it
 *   is updating. `current` waits for an entry that matches, which is what anything that acts on the
 *   numbers (publishing) must use.
 * - Builds for one key are shared: two tabs, or a table and its summary, never start two walks.
 *
 * Held on `globalThis` so hot reloads and separately bundled route handlers share one instance, and
 * optionally mirrored to the snapshot bucket so a restart starts warm.
 */
export interface CacheEntry<T> {
  value: T;
  fingerprint: string;
  builtAt: number;
}

export interface SwrResult<T> {
  value: T;
  builtAt: number;
  /** True while a newer build than `value` is in progress. */
  refreshing: boolean;
}

interface Slot<T> {
  entry?: CacheEntry<T>;
  stale: boolean;
  loaded: boolean;
  loading?: Promise<void>;
  inflight?: { fingerprint: string; promise: Promise<CacheEntry<T>> };
  lastUsed: number;
}

export interface SwrCache<T> {
  get(
    key: string,
    options: {
      fingerprint: string;
      maxAgeMs: number;
      build: () => Promise<T>;
      mode?: "swr" | "current";
    },
  ): Promise<SwrResult<T>>;
  /** Marks an entry stale without dropping it, so the next read still paints instantly. */
  invalidate(key: string): void;
  /** Stores a value built elsewhere, e.g. by a full read that happened for another reason. */
  set(key: string, value: T, fingerprint: string): void;
  peek(key: string): CacheEntry<T> | undefined;
}

type Registry = Map<string, Map<string, Slot<unknown>>>;

function registry(): Registry {
  const holder = globalThis as typeof globalThis & { __personaSwrCaches?: Registry };
  holder.__personaSwrCaches ??= new Map();
  return holder.__personaSwrCaches;
}

export function createSwrCache<T>(options: {
  name: string;
  maxEntries: number;
  /** Mirror entries to the snapshot bucket under `${name}/${key}.json.gz`. */
  persist?: boolean;
  /** Answer from the previous entry even when the inputs changed, while the new one builds. */
  staleOnInputChange?: boolean;
}): SwrCache<T> {
  const slots = (() => {
    const all = registry();
    let existing = all.get(options.name);
    if (!existing) {
      existing = new Map();
      all.set(options.name, existing);
    }
    return existing as Map<string, Slot<T>>;
  })();

  const path = (key: string) => `${options.name}/${key}.json.gz`;

  function slotFor(key: string): Slot<T> {
    let slot = slots.get(key);
    if (!slot) {
      slot = { stale: false, loaded: !options.persist, lastUsed: Date.now() };
      slots.set(key, slot);
      evict();
    }
    slot.lastUsed = Date.now();
    return slot;
  }

  function evict() {
    if (slots.size <= options.maxEntries) return;
    const victims = [...slots.entries()]
      .filter(([, slot]) => !slot.inflight)
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed)
      .slice(0, slots.size - options.maxEntries);
    for (const [key] of victims) slots.delete(key);
  }

  async function ensureLoaded(key: string, slot: Slot<T>) {
    if (slot.loaded) return;
    slot.loading ??= (async () => {
      const stored = await loadSnapshot<CacheEntry<T>>(path(key));
      if (stored && !slot.entry && typeof stored.fingerprint === "string" && typeof stored.builtAt === "number") {
        slot.entry = stored;
      }
      slot.loaded = true;
    })();
    await slot.loading;
  }

  function startBuild(key: string, slot: Slot<T>, fingerprint: string, build: () => Promise<T>) {
    if (slot.inflight?.fingerprint === fingerprint) return slot.inflight.promise;
    const promise = (async () => {
      const value = await build();
      const entry: CacheEntry<T> = { value, fingerprint, builtAt: Date.now() };
      // A build started for an older fingerprint must not replace a newer one that finished first.
      if (!slot.entry || slot.entry.builtAt <= entry.builtAt) {
        slot.entry = entry;
        slot.stale = false;
      }
      if (options.persist) void saveSnapshot(path(key), entry);
      return entry;
    })();
    const inflight = { fingerprint, promise };
    slot.inflight = inflight;
    promise
      .catch((error) => console.error(`[swr-cache ${options.name}] build failed for ${key}`, error))
      .finally(() => {
        if (slot.inflight === inflight) slot.inflight = undefined;
      });
    return promise;
  }

  return {
    async get(key, { fingerprint, maxAgeMs, build, mode = "swr" }) {
      const slot = slotFor(key);
      await ensureLoaded(key, slot);
      const entry = slot.entry;
      const fresh =
        entry !== undefined &&
        !slot.stale &&
        entry.fingerprint === fingerprint &&
        Date.now() - entry.builtAt <= maxAgeMs;

      if (entry && fresh) return { value: entry.value, builtAt: entry.builtAt, refreshing: false };

      // Age alone never blocks a screen. Changed inputs do, unless the cache was created to show the
      // previous answer while the new one is built (a catalog mirror that is still literally what
      // the remote system held a moment ago).
      const servable = entry !== undefined &&
        (entry.fingerprint === fingerprint || options.staleOnInputChange === true);
      if (entry && servable && mode === "swr") {
        void startBuild(key, slot, fingerprint, build).catch(() => undefined);
        return { value: entry.value, builtAt: entry.builtAt, refreshing: true };
      }

      const built = await startBuild(key, slot, fingerprint, build);
      return { value: built.value, builtAt: built.builtAt, refreshing: false };
    },

    invalidate(key) {
      const slot = slots.get(key);
      if (slot) slot.stale = true;
    },

    set(key, value, fingerprint) {
      const slot = slotFor(key);
      slot.entry = { value, fingerprint, builtAt: Date.now() };
      slot.stale = false;
      slot.loaded = true;
      if (options.persist) void saveSnapshot(path(key), slot.entry);
    },

    peek(key) {
      return slots.get(key)?.entry;
    },
  };
}
