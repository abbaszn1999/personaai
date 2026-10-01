import { createHash } from "node:crypto";
import { getGeminiClient } from "@/lib/ai/gemini";

/**
 * Explicit Gemini context caches for the agents' fixed prompt prefixes.
 *
 * A cache is keyed by a hash of the model and the exact prefix bytes, so a changed skill file or
 * a rebuilt path config produces a new key and can never be served a stale prefix. Creation
 * happens in the background: the turn that finds no cache runs with the prefix inline (Gemini's
 * implicit caching still applies to it) and the next turn picks the explicit cache up.
 */

const TTL_SECONDS = 60 * 60;
/** Treat a cache as gone a little before Gemini does, so no call races its expiry. */
const EXPIRY_MARGIN_MS = 2 * 60_000;
/** Gemini rejects caches below its minimum (about 1,024 tokens on Flash); ~4 chars per token
 *  keeps a margin above it. A rejected create just backs off and the call runs inline. */
const MIN_PREFIX_CHARS = 4_500;
/** After a failed create, wait before trying the same key again. */
const FAILURE_BACKOFF_MS = 10 * 60_000;

export interface PrefixCacheEntry {
  name: string;
  key: string;
  expiresAt: string;
}

const entries = new Map<string, { name: string; expiresAt: number }>();
const failures = new Map<string, number>();
const creating = new Set<string>();

export function prefixCacheKey(model: string, prefix: string): string {
  return createHash("sha256").update(`${model}\n${prefix}`).digest("hex").slice(0, 40);
}

function isUsable(expiresAt: number): boolean {
  return expiresAt - EXPIRY_MARGIN_MS > Date.now();
}

export interface ResolvePrefixCacheInput {
  apiKey: string;
  model: string;
  prefix: string;
  displayName: string;
  /** A cache recorded elsewhere (the store's DB row), reusable across server instances. */
  stored?: PrefixCacheEntry | null;
  /** Called after a new cache is created, to record it for other instances. */
  persist?: (entry: PrefixCacheEntry) => Promise<void>;
}

/** Returns a usable cache name now, or null (run inline) while one is created in the background. */
export function resolvePrefixCache(input: ResolvePrefixCacheInput): string | null {
  if (process.env.GEMINI_DISABLE_EXPLICIT_CACHE === "1") return null;
  if (input.prefix.length < MIN_PREFIX_CHARS) return null;

  const key = prefixCacheKey(input.model, input.prefix);
  const known = entries.get(key);
  if (known && isUsable(known.expiresAt)) return known.name;

  if (input.stored && input.stored.key === key) {
    const expiresAt = Date.parse(input.stored.expiresAt);
    if (Number.isFinite(expiresAt) && isUsable(expiresAt)) {
      entries.set(key, { name: input.stored.name, expiresAt });
      return input.stored.name;
    }
  }

  const failedAt = failures.get(key);
  if (failedAt && Date.now() - failedAt < FAILURE_BACKOFF_MS) return null;
  if (!creating.has(key)) void createCache(key, input);
  return null;
}

async function createCache(key: string, input: ResolvePrefixCacheInput): Promise<void> {
  creating.add(key);
  try {
    const ai = getGeminiClient(input.apiKey);
    const cache = await ai.caches.create({
      model: input.model,
      config: {
        displayName: `${input.displayName}:${key.slice(0, 12)}`,
        systemInstruction: input.prefix,
        ttl: `${TTL_SECONDS}s`,
      },
    });
    if (!cache.name) throw new Error("Gemini returned a cache without a name");
    const expiresAt = cache.expireTime ? Date.parse(cache.expireTime) : Date.now() + TTL_SECONDS * 1000;
    entries.set(key, { name: cache.name, expiresAt });
    failures.delete(key);
    await input.persist?.({ name: cache.name, key, expiresAt: new Date(expiresAt).toISOString() });
  } catch (error) {
    failures.set(key, Date.now());
    console.warn(
      `[gemini-cache] could not cache ${input.displayName}; running inline:`,
      error instanceof Error ? error.message : error
    );
  } finally {
    creating.delete(key);
  }
}

/** Drops a cache Gemini no longer recognises, so the next turn recreates it. */
export function forgetPrefixCache(name: string): void {
  for (const [key, entry] of entries) {
    if (entry.name === name) entries.delete(key);
  }
}
