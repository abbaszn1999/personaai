/**
 * Ephemeral per-user avatar cache for the wearable chat agent. Generated avatars are large
 * data URLs (often several MB). Sending them on every chat turn blew past Next.js's default
 * 10MB body limit, truncating the JSON and wiping conversation history — which made the
 * model reply with generic "Hi, I'm your Style Assistant" intros as if every turn were new.
 *
 * The client sends the avatar once (or when it changes); subsequent turns omit it and we
 * reuse the cached copy here for try_on / update_measurements.
 */
interface CachedAvatar {
  avatarUrl: string;
  photoBase64: string | null;
  photoMimeType: string | null;
  expiresAt: number;
}

const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours — covers a long shopping session
const cache = new Map<string, CachedAvatar>();

function pruneExpired() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt < now) cache.delete(key);
  }
}

export function rememberWearableAvatar(
  userId: string,
  patch: { avatarUrl?: string | null; photoBase64?: string | null; photoMimeType?: string | null }
): void {
  pruneExpired();
  const existing = cache.get(userId);
  const avatarUrl = patch.avatarUrl ?? existing?.avatarUrl ?? null;
  if (!avatarUrl) return;

  cache.set(userId, {
    avatarUrl,
    photoBase64: patch.photoBase64 !== undefined ? patch.photoBase64 : (existing?.photoBase64 ?? null),
    photoMimeType: patch.photoMimeType !== undefined ? patch.photoMimeType : (existing?.photoMimeType ?? null),
    expiresAt: Date.now() + TTL_MS,
  });
}

export function getWearableAvatar(userId: string): CachedAvatar | null {
  pruneExpired();
  const entry = cache.get(userId);
  if (!entry) return null;
  return entry;
}
