import { GoogleGenAI } from "@google/genai";

export class GeminiApiError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = "GeminiApiError";
  }
}

/**
 * True when a call failed because the account has no quota or credit left, rather than because
 * anything was wrong with the request.
 *
 * Callers that retry per item need this distinction: an exhausted account fails *every* item
 * identically, so counting those failures against a per-item attempt limit retires the entire
 * workload over a billing problem that has nothing to do with the items themselves.
 *
 * The SDK does not surface a stable code on every path, so this matches the status when present
 * and falls back to the serialised error body.
 */
export function isQuotaExhaustedError(err: unknown): boolean {
  if (err instanceof GeminiApiError && err.status === 429) return true;
  if (!(err instanceof Error)) return false;
  const message = err.message;
  return (
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("credits are depleted") ||
    /"code"\s*:\s*429/.test(message) ||
    message.includes("quota")
  );
}

/**
 * Clients are cached per API key. Catalog, sizing, and chat share the platform GEMINI_API_KEY;
 * the cache still keys by secret so a rotated env var starts a new client. Bounded and
 * LRU-evicted so a large tenant count can't grow it without limit.
 */
const clientCache = new Map<string, GoogleGenAI>();
const MAX_CACHED_CLIENTS = 50;

export function getGeminiClient(apiKey: string): GoogleGenAI {
  if (!apiKey) {
    throw new GeminiApiError("No Gemini API key was provided.");
  }

  const cached = clientCache.get(apiKey);
  if (cached) {
    // Re-insert to move this key to the most-recently-used end of the iteration order.
    clientCache.delete(apiKey);
    clientCache.set(apiKey, cached);
    return cached;
  }

  const client = new GoogleGenAI({ apiKey });
  clientCache.set(apiKey, client);

  if (clientCache.size > MAX_CACHED_CLIENTS) {
    const oldest = clientCache.keys().next().value;
    if (oldest !== undefined) clientCache.delete(oldest);
  }

  return client;
}

/** The platform's own key, used by the shopper agents, sizing and catalog mapping. Avatar and
 *  try-on rendering runs on Pruna (see lib/ai/pruna.ts), not here. */
export function getPlatformGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiApiError("Gemini API key is not configured (GEMINI_API_KEY).");
  }
  return apiKey;
}

export function getPlatformGeminiClient(): GoogleGenAI {
  return getGeminiClient(getPlatformGeminiApiKey());
}
