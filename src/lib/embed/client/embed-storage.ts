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
const SHOPPER_TOKEN_PREFIX = "autoshopping_shopper_token:";
const GUEST_FLAG_PREFIX = "autoshopping_guest:";

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    // Some embedding contexts (privacy modes, sandboxed iframes) throw on access.
    return null;
  }
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** True while this tab is a guest visit. The flag itself lives in the tab's session storage, so it
 *  survives a reload but not a new tab or a closed one. */
export function isGuestMode(embedToken: string): boolean {
  try {
    return safeSessionStorage()?.getItem(`${GUEST_FLAG_PREFIX}${embedToken}`) === "1";
  } catch {
    return false;
  }
}

/** Switch before saving anything for a guest: from then on everything below (session id, widget
 *  state, token) goes to the tab's session storage, which the browser empties when the tab closes. */
export function setGuestMode(embedToken: string, on: boolean): void {
  const storage = safeSessionStorage();
  if (!storage) return;
  try {
    if (on) storage.setItem(`${GUEST_FLAG_PREFIX}${embedToken}`, "1");
    else storage.removeItem(`${GUEST_FLAG_PREFIX}${embedToken}`);
  } catch {
    // Non-fatal.
  }
}

/** Where this visitor's data lives: the tab for a guest, the device for everyone else. A guest
 *  whose browser blocks session storage gets none at all, rather than falling back to the device. */
function storageFor(embedToken: string): Storage | null {
  return isGuestMode(embedToken) ? safeSessionStorage() : safeLocalStorage();
}

/** One random id per (browser, embed token) pair — used server-side only to key the ephemeral
 *  avatar cache per-shopper, never sent anywhere else or treated as an identity. */
export function getOrCreateEmbedSessionId(embedToken: string): string {
  const storage = storageFor(embedToken);
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

/** Forgets this browser's session id so the next shopper to sign in gets a new one and
 *  doesn't inherit the previous shopper's spend on the usage page. */
export function resetEmbedSessionId(embedToken: string): void {
  const storage = storageFor(embedToken);
  if (!storage) return;
  try {
    storage.removeItem(`${SESSION_ID_PREFIX}${embedToken}`);
  } catch {
    // Non-fatal.
  }
}

export function loadEmbedState<T>(embedToken: string): T | null {
  const storage = storageFor(embedToken);
  if (!storage) return null;
  try {
    const raw = storage.getItem(`${STATE_PREFIX}${embedToken}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveEmbedState<T>(embedToken: string, state: T): void {
  const storage = storageFor(embedToken);
  if (!storage) return;
  try {
    storage.setItem(`${STATE_PREFIX}${embedToken}`, JSON.stringify(state));
  } catch {
    // Storage full/unavailable — the session simply won't survive a reload, non-fatal.
  }
}

export function clearEmbedState(embedToken: string): void {
  const storage = storageFor(embedToken);
  if (!storage) return;
  try {
    storage.removeItem(`${STATE_PREFIX}${embedToken}`);
  } catch {
    // Non-fatal.
  }
}

export function loadShopperToken(embedToken: string): string | null {
  const storage = storageFor(embedToken);
  if (!storage) return null;
  try {
    return storage.getItem(`${SHOPPER_TOKEN_PREFIX}${embedToken}`);
  } catch {
    return null;
  }
}

export function saveShopperToken(embedToken: string, token: string): void {
  const storage = storageFor(embedToken);
  if (!storage) return;
  try {
    storage.setItem(`${SHOPPER_TOKEN_PREFIX}${embedToken}`, token);
  } catch {
    // Non-fatal — the shopper will just have to sign in again next visit.
  }
}

/** Headers for an embed API call, carrying the signed-in shopper's session. The chat, image and
 *  live try-on endpoints spend the merchant's wallet and refuse calls without it. */
export function embedRequestHeaders(embedToken: string): Record<string, string> {
  const token = loadShopperToken(embedToken);
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

export function clearShopperToken(embedToken: string): void {
  const storage = storageFor(embedToken);
  if (!storage) return;
  try {
    storage.removeItem(`${SHOPPER_TOKEN_PREFIX}${embedToken}`);
  } catch {
    // Non-fatal.
  }
}
