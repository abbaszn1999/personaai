import { createHash } from "node:crypto";
import type { CachedContent } from "@google/genai";
import { getGeminiClient } from "@/lib/ai/gemini";
import { geminiCacheCostNanos } from "@/lib/billing/pricing";

/**
 * Explicit Gemini context caches for the agents' fixed prompt prefixes.
 *
 * A cache is keyed by a hash of the model and the exact prefix bytes, so a changed skill file or
 * a rebuilt path config produces a new key and can never be served a stale prefix. Only a prefix
 * requested often enough to pay for its storage gets one; the rest run inline, where Gemini's
 * implicit caching still applies. Creation and extension happen in the background: the turn that
 * finds no cache runs with the prefix inline and a later turn picks the explicit cache up.
 */

const TTL_SECONDS = 60 * 60;
/** Treat a cache as gone a little before Gemini does, so no call races its expiry. */
const EXPIRY_MARGIN_MS = 2 * 60_000;
/** A busy cache this close to its expiry has its TTL extended instead of being recreated. */
const EXTEND_WITHIN_MS = 10 * 60_000;
/** Gemini rejects explicit caches under 4,096 tokens on 3.x Flash. At ~3 characters per token a
 *  shorter prefix is almost surely under it; a longer one Gemini still rejects is remembered. */
const MIN_PREFIX_CHARS = 4_096 * 3;
/** A key earns an explicit cache once requested this many times within the window. */
const BUSY_MIN_CALLS = 6;
const BUSY_WINDOW_MS = 10 * 60_000;
/** After a failed create or extension, wait before trying the same key again. */
const FAILURE_BACKOFF_MS = 10 * 60_000;
/** A DB row can keep naming a cache Gemini reported missing until the row's own expiry. */
const DEAD_NAME_MS = TTL_SECONDS * 1000;
const MAX_TRACKED = 500;

export interface PrefixCacheEntry {
  name: string;
  key: string;
  expiresAt: string;
}

interface KnownCache {
  name: string;
  expiresAt: number;
}

const entries = new Map<string, KnownCache>();
/** When a key may next try a create; never again for a prefix Gemini found too small. */
const retryAt = new Map<string, number>();
const recentCalls = new Map<string, number[]>();
const deadNames = new Map<string, number>();
/** The newest cache per model and display name, so the one a new prefix replaces is deleted. */
const latest = new Map<string, { key: string; name: string }>();
const pending = new Set<string>();

export function prefixCacheKey(model: string, prefix: string): string {
  return createHash("sha256").update(`${model}\n${prefix}`).digest("hex").slice(0, 40);
}

/** Inserts as the newest entry and drops the oldest past the cap. */
function remember<K, V>(map: Map<K, V>, key: K, value: V): void {
  map.delete(key);
  map.set(key, value);
  if (map.size > MAX_TRACKED) map.delete(map.keys().next().value as K);
}

function isUsable(expiresAt: number): boolean {
  return expiresAt - EXPIRY_MARGIN_MS > Date.now();
}

function isDead(name: string): boolean {
  return (deadNames.get(name) ?? 0) > Date.now();
}

function minCalls(): number {
  const value = Number(process.env.GEMINI_EXPLICIT_CACHE_MIN_CALLS);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : BUSY_MIN_CALLS;
}

/** Records one request for the key and reports whether the key is busy. */
function countCall(key: string): boolean {
  const now = Date.now();
  const needed = minCalls();
  const calls = [...(recentCalls.get(key) ?? []).filter((at) => now - at < BUSY_WINDOW_MS), now].slice(-needed);
  remember(recentCalls, key, calls);
  return calls.length >= needed;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isGoneError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return status === 403 || status === 404 || /not found|expired|NOT_FOUND|PERMISSION_DENIED/i.test(errorMessage(error));
}

function isTooSmallError(error: unknown): boolean {
  return /too small|min_total_token_count/i.test(errorMessage(error));
}

function expiryOf(cache: CachedContent): number {
  const expiresAt = cache.expireTime ? Date.parse(cache.expireTime) : NaN;
  return Number.isFinite(expiresAt) ? expiresAt : Date.now() + TTL_SECONDS * 1000;
}

function slotOf(input: ResolvePrefixCacheInput): string {
  return `${input.model}\n${input.displayName}`;
}

export interface ResolvePrefixCacheInput {
  apiKey: string;
  model: string;
  prefix: string;
  displayName: string;
  /** A cache recorded elsewhere (the store's DB row), reusable across server instances. */
  stored?: PrefixCacheEntry | null;
  /** Called after a cache is created or extended, to record it for other instances. */
  persist?: (entry: PrefixCacheEntry) => Promise<void>;
  /** What a create or extension this call started cost — creation tokens and the storage hours
   *  bought — so it is charged to whoever the prefix belongs to. Called once per create/extend. */
  onCost?: (charge: CacheCharge) => void;
  /** Receives the background create/extend this call started, so the caller can wait for its cost. */
  track?: (task: Promise<void>) => void;
}

export interface CacheCharge {
  nanos: number;
  tokens: number;
  name: string;
  created: boolean;
}

/** Tokens a prefix is charged for when Gemini does not report them: ~2.5 characters per token is
 *  denser than this markdown ever is, so the estimate errs on the side of the real cost. */
function tokensOf(cache: CachedContent, prefix: string): number {
  const reported = cache.usageMetadata?.totalTokenCount;
  return typeof reported === "number" && reported > 0 ? reported : Math.ceil(prefix.length / 2.5);
}

/** Returns a usable cache name now, or null to run inline; a busy key without one gets it created
 *  in the background for a later turn. */
export function resolvePrefixCache(input: ResolvePrefixCacheInput): string | null {
  if (process.env.GEMINI_DISABLE_EXPLICIT_CACHE === "1") return null;
  if (input.prefix.length < MIN_PREFIX_CHARS) return null;

  const key = prefixCacheKey(input.model, input.prefix);
  const busy = countCall(key);
  const mayTry = (retryAt.get(key) ?? 0) <= Date.now();
  const cache = usableCache(key, input);
  if (cache) {
    if (busy && mayTry && cache.expiresAt - Date.now() < EXTEND_WITHIN_MS) {
      inBackground(key, () => extendCache(key, cache, input), input.track);
    }
    return cache.name;
  }
  if (busy && mayTry) inBackground(key, () => createCache(key, input), input.track);
  return null;
}

/** The longest-lived cache for the key that is neither near expiry nor known dead: this
 *  process's own, or the one another instance recorded in the DB row. */
function usableCache(key: string, input: ResolvePrefixCacheInput): KnownCache | null {
  const stored =
    input.stored?.key === key ? { name: input.stored.name, expiresAt: Date.parse(input.stored.expiresAt) } : null;
  let best: KnownCache | null = null;
  for (const candidate of [entries.get(key), stored]) {
    if (!candidate || !isUsable(candidate.expiresAt) || isDead(candidate.name)) continue;
    if (!best || candidate.expiresAt > best.expiresAt) best = candidate;
  }
  if (!best) return null;
  remember(entries, key, best);
  remember(latest, slotOf(input), { key, name: best.name });
  return best;
}

function inBackground(key: string, task: () => Promise<void>, track?: (task: Promise<void>) => void): void {
  if (pending.has(key)) return;
  pending.add(key);
  const running = task()
    .catch((error) => console.warn("[gemini-cache]", errorMessage(error)))
    .finally(() => pending.delete(key));
  track?.(running);
}

function logCache(
  action: "created" | "extended",
  input: ResolvePrefixCacheInput,
  key: string,
  name: string,
  cache: CachedContent
): void {
  const tokens = cache.usageMetadata?.totalTokenCount;
  console.log(
    `[gemini-cache] ${action} ${input.displayName} name=${name.slice(0, 24)} key=${key.slice(0, 12)}` +
      (tokens ? ` tokens=${tokens}` : "")
  );
}

async function createCache(key: string, input: ResolvePrefixCacheInput): Promise<void> {
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
    const expiresAt = expiryOf(cache);
    remember(entries, key, { name: cache.name, expiresAt });
    retryAt.delete(key);
    logCache("created", input, key, cache.name, cache);
    const tokens = tokensOf(cache, input.prefix);
    input.onCost?.({
      nanos: geminiCacheCostNanos({
        tokens,
        ttlSeconds: Math.max(0, (expiresAt - Date.now()) / 1000),
        created: true,
        model: input.model,
      }),
      tokens,
      name: cache.name,
      created: true,
    });
    supersede(key, cache.name, input);
    await input.persist?.({ name: cache.name, key, expiresAt: new Date(expiresAt).toISOString() });
  } catch (error) {
    remember(retryAt, key, isTooSmallError(error) ? Infinity : Date.now() + FAILURE_BACKOFF_MS);
    console.warn(`[gemini-cache] could not cache ${input.displayName}; running inline:`, errorMessage(error));
  }
}

async function extendCache(key: string, known: KnownCache, input: ResolvePrefixCacheInput): Promise<void> {
  const { name } = known;
  let cache: CachedContent;
  try {
    cache = await getGeminiClient(input.apiKey).caches.update({ name, config: { ttl: `${TTL_SECONDS}s` } });
  } catch (error) {
    if (isGoneError(error)) {
      forgetPrefixCache(name);
      return createCache(key, input);
    }
    remember(retryAt, key, Date.now() + FAILURE_BACKOFF_MS);
    console.warn(`[gemini-cache] could not extend ${input.displayName}:`, errorMessage(error));
    return;
  }
  const expiresAt = expiryOf(cache);
  remember(entries, key, { name, expiresAt });
  logCache("extended", input, key, name, cache);
  // Storage is billed for the hours the extension added on top of what was already paid for.
  const tokens = tokensOf(cache, input.prefix);
  input.onCost?.({
    nanos: geminiCacheCostNanos({
      tokens,
      ttlSeconds: Math.max(0, (expiresAt - Math.max(known.expiresAt, Date.now())) / 1000),
      created: false,
      model: input.model,
    }),
    tokens,
    name,
    created: false,
  });
  await input.persist?.({ name, key, expiresAt: new Date(expiresAt).toISOString() });
}

/** Records a new cache as its display name's newest and deletes the one a changed prefix left behind. */
function supersede(key: string, name: string, input: ResolvePrefixCacheInput): void {
  const slot = slotOf(input);
  const previous = latest.get(slot);
  remember(latest, slot, { key, name });
  if (!previous || previous.key === key) return;
  forgetPrefixCache(previous.name);
  void deleteCache(input.apiKey, previous.name);
}

async function deleteCache(apiKey: string, name: string): Promise<void> {
  try {
    await getGeminiClient(apiKey).caches.delete({ name });
  } catch (error) {
    if (!isGoneError(error)) console.warn(`[gemini-cache] could not delete ${name}:`, errorMessage(error));
  }
}

/** Drops a cache Gemini no longer recognises; a DB row still naming it is ignored from now on. */
export function forgetPrefixCache(name: string): void {
  remember(deadNames, name, Date.now() + DEAD_NAME_MS);
  for (const [key, entry] of entries) {
    if (entry.name === name) entries.delete(key);
  }
}
