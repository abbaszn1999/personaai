export interface LiveGrantPayload {
  v: 1;
  /** Merchant (users.id) whose live try-on wallet pays for the session. */
  ownerId: string;
  source: "store" | "preview";
  /** The app's session id for this shopper or dashboard preview (realtime_tryon_events.session_id). */
  sessionId: string;
  /** Unique per grant; the proxy uses it to cap reconnects to `maxSeconds` in total. */
  grantId: string;
  maxSeconds: number;
  /** Unix seconds after which the proxy refuses to open a session with this grant. */
  exp: number;
}

export const LIVE_GRANT_MIN_SECONDS: number;
export const LIVE_GRANT_MAX_SECONDS: number;

export function signLiveGrant(payload: Omit<LiveGrantPayload, "v">, secret: string): string;
export function verifyLiveGrant(
  grant: unknown,
  secret: string | undefined,
  options?: { now?: number; ignoreExpiry?: boolean }
): LiveGrantPayload | null;
export function signUsageReport(rawBody: string, secret: string): string;
export function verifyUsageReport(rawBody: string, signature: string | null, secret: string | undefined): boolean;
