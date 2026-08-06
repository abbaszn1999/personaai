"use client";

/**
 * Shopper-side persistence for the embedded (no-login) experience — shared by both the
 * wearable (try-on) and unwearable (shopping assistant) widgets. This app is already fully
 * stateless server-side for both chat agents — every turn re-sends the client's state/chat
 * history — so surviving a page reload only requires mirroring that same state into the
 * shopper's own browser storage, namespaced per embed token so multiple merchants' widgets on
 * the same device (or multiple tabs) never collide.
 */

const SESSION_ID_PREFIX = "autoshopping_embed_session:";
const STATE_PREFIX = "autoshopping_embed_state:";

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    // Some embedding contexts (privacy modes, sandboxed iframes) throw on access.
    return null;
  }
}

/** One random id per (browser, embed token) pair — used server-side only to key the ephemeral
 *  avatar cache per-shopper, never sent anywhere else or treated as an identity. */
export function getOrCreateEmbedSessionId(embedToken: string): string {
  const storage = safeLocalStorage();
  const key = `${SESSION_ID_PREFIX}${embedToken}`;
  if (!storage) return `ephemeral-${Math.random().toString(36).slice(2)}`;

  const existing = storage.getItem(key);
  if (existing) return existing;

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  storage.setItem(key, id);
  return id;
}

export function loadEmbedState<T>(embedToken: string): T | null {
  const storage = safeLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(`${STATE_PREFIX}${embedToken}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveEmbedState<T>(embedToken: string, state: T): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(`${STATE_PREFIX}${embedToken}`, JSON.stringify(state));
  } catch {
    // Storage full/unavailable — the session simply won't survive a reload, non-fatal.
  }
}

export function clearEmbedState(embedToken: string): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(`${STATE_PREFIX}${embedToken}`);
  } catch {
    // Non-fatal.
  }
}
