import { randomUUID } from "node:crypto";
import { signLiveGrant } from "../../../scripts/live-grant.mjs";
import {
  createDecartClientToken,
  DecartApiError,
  getDecartRealtimeProxyUrl,
  REALTIME_TRYON_MIN_SESSION_SECONDS,
  REALTIME_TRYON_SESSION_CAP_SECONDS,
} from "@/lib/ai/decart";
import type { UsageSurface } from "@/lib/billing/pricing";

/** How long the browser has to open (or reopen) the live session with what it was handed. */
const ACCESS_LIFETIME_SECONDS = 600;

export interface LiveAccess {
  /** A live grant when metered, else a Decart client token. Either way the SDK's `apiKey`. */
  apiKey: string;
  expiresAt: string;
  realtimeBaseUrl?: string;
  /** True when the proxy bills the session from Decart's own seconds, so the browser must not. */
  metered: boolean;
}

/**
 * True when live sessions are billed by the proxy. Browsers then never receive a Decart token and
 * their own usage reports are analytics only, never billable.
 */
export function isLiveMeteringEnabled(): boolean {
  return Boolean(getDecartRealtimeProxyUrl() && process.env.LIVE_PROXY_SECRET);
}

/**
 * What the browser needs to open a live try-on session. With metering on this is a signed grant
 * instead of a Decart token: the browser never holds a Decart credential, so it can neither skip
 * the proxy nor under-report its own usage.
 */
export async function issueLiveAccess(input: {
  ownerId: string;
  source: UsageSurface;
  sessionId: unknown;
  remainingSeconds: number;
}): Promise<LiveAccess> {
  const realtimeBaseUrl = getDecartRealtimeProxyUrl();

  if (!isLiveMeteringEnabled()) {
    const token = await createDecartClientToken(input.remainingSeconds);
    return { apiKey: token.apiKey, expiresAt: token.expiresAt, realtimeBaseUrl, metered: false };
  }

  const maxSeconds = Math.min(REALTIME_TRYON_SESSION_CAP_SECONDS, Math.floor(input.remainingSeconds));
  if (!Number.isFinite(maxSeconds) || maxSeconds < REALTIME_TRYON_MIN_SESSION_SECONDS) {
    throw new DecartApiError("There isn't enough live try-on time left for a session.", 402);
  }
  const sessionId =
    typeof input.sessionId === "string" && input.sessionId.trim() && input.sessionId.length <= 200
      ? input.sessionId.trim()
      : randomUUID();
  const exp = Math.floor(Date.now() / 1000) + ACCESS_LIFETIME_SECONDS;
  const apiKey = signLiveGrant(
    { ownerId: input.ownerId, source: input.source, sessionId, grantId: randomUUID(), maxSeconds, exp },
    process.env.LIVE_PROXY_SECRET as string
  );
  return { apiKey, expiresAt: new Date(exp * 1000).toISOString(), realtimeBaseUrl, metered: true };
}
