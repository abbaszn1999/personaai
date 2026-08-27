/**
 * Per-host failure tracking, so one unreachable origin is discovered once rather than re-proven
 * by every request that needs it.
 *
 * A merchant store going down is not one failure, it is every image on the page plus the live
 * price refresh on every turn, each independently paying a full connect timeout. Shared here
 * rather than kept inside the image proxy because the images and the store's REST API are the
 * same host: whichever consumer finds out first should spare the others the wait.
 *
 * Process-local and deliberately so — the timeouts it saves are per-process, and a shared store
 * would mean a network round trip on the path whose latency this exists to remove.
 */

const FAILURE_THRESHOLD = 3;
const BASE_BLOCK_MS = 30_000;
const MAX_BLOCK_MS = 5 * 60_000;

interface HostState {
  failures: number;
  blockedUntil: number;
}

const hosts = new Map<string, HostState>();

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True while the host is known-bad, meaning callers should degrade immediately instead of
 *  opening a connection that has just failed repeatedly. */
export function isHostBlocked(hostname: string | null): boolean {
  if (!hostname) return false;
  const state = hosts.get(hostname);
  return state !== undefined && state.blockedUntil > Date.now();
}

/**
 * A few isolated failures are normal — a single missing image, one slow request — so the
 * circuit only opens on the third, and then backs off exponentially up to five minutes. An
 * outage that lasts hours should not be re-probed by a thundering herd every thirty seconds.
 */
export function recordHostFailure(hostname: string | null): void {
  if (!hostname) return;
  const previous = hosts.get(hostname);
  const failures = (previous?.failures ?? 0) + 1;
  const over = failures - FAILURE_THRESHOLD;
  hosts.set(hostname, {
    failures,
    blockedUntil: over >= 0 ? Date.now() + Math.min(BASE_BLOCK_MS * 2 ** over, MAX_BLOCK_MS) : 0,
  });
}

export function recordHostSuccess(hostname: string | null): void {
  if (hostname) hosts.delete(hostname);
}

/** Test seam. Nothing in the app clears this — a recovered host clears itself on its next
 *  success, once the block expires. */
export function resetHostHealth(): void {
  hosts.clear();
}
