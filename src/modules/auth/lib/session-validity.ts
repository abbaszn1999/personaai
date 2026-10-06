/**
 * Whether a merchant's session cookie still names a live row in `public.sessions`.
 *
 * The cookie is sealed, so it proves the server issued it — not that it has not been revoked since.
 * Logging out elsewhere, changing or resetting the password and deleting the account all remove
 * session rows, and this is what makes those removals end the other devices' access.
 *
 * Answers are remembered briefly per server instance so a page full of API calls costs one lookup.
 * A lookup that fails (network, database) lets the request through: an outage must not sign every
 * merchant out, and the cookie is still a valid server-issued credential.
 *
 * Uses the REST endpoint directly, so it runs in the proxy as well as in route handlers.
 */
const CACHE_MS = 30_000;

interface CachedValidity {
  live: boolean;
  userId: string;
  at: number;
}

function cache(): Map<string, CachedValidity> {
  const holder = globalThis as typeof globalThis & { __personaSessionValidity?: Map<string, CachedValidity> };
  holder.__personaSessionValidity ??= new Map();
  return holder.__personaSessionValidity;
}

export async function isSessionLive(sid: string | undefined, userId: string | undefined): Promise<boolean> {
  if (!sid || !userId) return false;
  const remembered = cache().get(sid);
  if (remembered && Date.now() - remembered.at <= CACHE_MS) {
    return remembered.live && remembered.userId === userId;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return true;

  try {
    const res = await fetch(
      `${url}/rest/v1/sessions?sid=eq.${encodeURIComponent(sid)}&select=sess,expire`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" },
    );
    if (!res.ok) return true;
    const rows = (await res.json()) as Array<{ sess?: { userId?: string } | null; expire?: string }>;
    const row = rows[0];
    const live =
      row !== undefined &&
      row.sess?.userId === userId &&
      (!row.expire || Date.parse(row.expire) > Date.now());
    if (cache().size > 20_000) cache().clear();
    cache().set(sid, { live, userId, at: Date.now() });
    return live;
  } catch {
    return true;
  }
}

/** Forget what this instance remembered, so a revocation it made takes effect here at once. */
export function forgetSessionValidity(sids?: readonly string[]): void {
  if (!sids) {
    cache().clear();
    return;
  }
  for (const sid of sids) cache().delete(sid);
}
