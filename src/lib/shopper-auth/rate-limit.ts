/**
 * In-memory limiters guarding the shopper login-code flow against abuse — per (workspace,
 * email) so one inbox can't be spammed, and per IP so one client can't cycle through many
 * emails to spam an entire merchant's shopper base. Same in-memory/per-process pattern as
 * src/lib/embed/rate-limiter.ts and src/lib/catalog/rate-limiter.ts; a multi-instance deploy
 * would under-count slightly across processes, which only ever makes the limit *stricter*,
 * never a security hole.
 */
interface Counter {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_EMAIL = 5; // 5 codes/hour to the same inbox
const MAX_PER_IP = 20; // 20 codes/hour total from one client

const byEmailKey = new Map<string, Counter>();
const byIp = new Map<string, Counter>();

function checkAndIncrement(map: Map<string, Counter>, key: string, max: number): boolean {
  const now = Date.now();
  const existing = map.get(key);
  if (!existing || now - existing.windowStart > WINDOW_MS) {
    map.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (existing.count >= max) return false;
  existing.count += 1;
  return true;
}

/** Returns true if a new login code may be sent. Checks (and increments) both limiters —
 *  callers should only actually send the email once this returns true. */
export function allowLoginCodeRequest(workspaceId: string, email: string, ip: string): boolean {
  const emailOk = checkAndIncrement(byEmailKey, `${workspaceId}:${email.toLowerCase()}`, MAX_PER_EMAIL);
  const ipOk = checkAndIncrement(byIp, ip, MAX_PER_IP);
  return emailOk && ipOk;
}
