/**
 * Ephemeral in-memory store for shopper-uploaded custom backdrop photos. Deliberately not
 * persisted to disk or a DB — this is "temp for now": the bytes live only in this process's
 * memory, so they vanish on the next deploy/restart (same trade-off as avatar-cache.ts).
 */
interface CachedBackdrop {
  data: Buffer;
  mimeType: string;
  expiresAt: number;
}

const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours — covers a long shopping session
const MAX_BYTES = 8 * 1024 * 1024; // 8MB per upload
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const cache = new Map<string, CachedBackdrop>();

function pruneExpired() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt < now) cache.delete(key);
  }
}

export class BackdropUploadError extends Error {}

export function storeCustomBackdrop(data: Buffer, mimeType: string): string {
  pruneExpired();

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new BackdropUploadError("Please upload a PNG, JPEG, or WebP image.");
  }
  if (data.byteLength === 0 || data.byteLength > MAX_BYTES) {
    throw new BackdropUploadError("Image must be under 8MB.");
  }

  const id = crypto.randomUUID();
  cache.set(id, { data, mimeType, expiresAt: Date.now() + TTL_MS });
  return id;
}

export function getCustomBackdrop(id: string): CachedBackdrop | null {
  pruneExpired();
  return cache.get(id) ?? null;
}
