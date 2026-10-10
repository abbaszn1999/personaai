/**
 * Remembers an async read for a few seconds per key and shares one read between concurrent callers.
 *
 * For values every chat turn reads but that change rarely (a store's connection row, its path
 * config, the merchant's billing state): thousands of shoppers on one store would otherwise repeat
 * the same database reads many times a second. Failures are never remembered.
 */
export interface ShortLivedCache<T> {
  get(key: string, read: () => Promise<T>): Promise<T>;
  /** Forgets one key, so the next read goes to the source. */
  forget(key: string): void;
  clear(): void;
}

export function createShortLivedCache<T>(options: { ttlMs: number; maxEntries: number }): ShortLivedCache<T> {
  const values = new Map<string, { value: T; expiresAt: number }>();
  const inflight = new Map<string, Promise<T>>();

  return {
    async get(key, read) {
      const now = Date.now();
      const cached = values.get(key);
      if (cached && cached.expiresAt > now) return cached.value;
      const running = inflight.get(key);
      if (running) return running;

      const promise = read()
        .then((value) => {
          if (values.size >= options.maxEntries && !values.has(key)) {
            const oldest = values.keys().next().value;
            if (oldest !== undefined) values.delete(oldest);
          }
          values.delete(key);
          values.set(key, { value, expiresAt: Date.now() + options.ttlMs });
          return value;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, promise);
      return promise;
    },
    forget(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
      inflight.clear();
    },
  };
}
