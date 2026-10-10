import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getPlatformGeminiApiKey } from "@/lib/ai/gemini";
import { createShortLivedCache } from "@/lib/cache/short-lived";
import { dispatchTurn } from "@/lib/agents/dispatch";
import { buildAgentContext, type AgentRequestState } from "@/lib/agents/shared/context";
import { agentEventStream, SSE_HEADERS } from "@/lib/agents/sse";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedOptions, EMBED_CORS_HEADERS } from "@/lib/embed/cors";
import type { ChatMessage } from "@/modules/commerce/types";
import { canStartSessionTurn, canUsePaidPlatform, getAccountBillingContext } from "@/lib/billing/account";
import { flushSessionMeter } from "@/lib/billing/flush-session-meter";
import { createSessionMeter } from "@/lib/billing/session-meter";
import { getShopperProfile } from "@/lib/db/shopper-profiles";

export const maxDuration = 60;

/**
 * The merchant's billing state, read once every few seconds per store rather than on every
 * shopper's turn. The check is a gate, not the charge: usage is still recorded atomically per turn
 * against the real balance, so a few seconds of staleness can only let a turn through that the
 * next read would have stopped.
 */
const billingContexts = createShortLivedCache<Awaited<ReturnType<typeof getAccountBillingContext>>>({
  ttlMs: 5_000,
  maxEntries: 5_000,
});

interface EmbedAgentRequestBody {
  embedToken?: string;
  /** Random id the shopper's browser generates once and persists — this app has no shopper
   *  login, so it is the stable per-shopper id ACS's visitorId wants. */
  sessionId?: string;
  messages?: ChatMessage[];
  audience?: string | null;
  measurements?: unknown;
  budget?: number | null;
  retrievalState?: AgentRequestState;
  attachment?: unknown;
  trigger?: unknown;
  referencedItemId?: unknown;
  /** The shopper's saved profile this turn is for. When it resolves, its stored audience and
   *  measurements are used instead of the ones the browser sent. */
  profileId?: unknown;
}

/** A turn sized on nothing would search unsized and fail the fit promise; the widget never sends
 *  one without measurements, so a request without them is not a real shopper turn. */
function hasBodyMeasurements(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  return ["heightCm", "chestCm", "waistCm"].some((key) => typeof raw[key] === "number" && Number.isFinite(raw[key]));
}

export async function OPTIONS() {
  return embedOptions();
}

export async function POST(req: NextRequest) {
  const body: EmbedAgentRequestBody = await req.json().catch(() => ({}));

  const resolution = await resolveEmbedRequest(body.embedToken, { req, kind: "paid" });
  if ("error" in resolution) return resolution.error;
  const { workspace, shopper } = resolution;

  const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : "anonymous";

  const billing = await billingContexts.get(workspace.ownerId, () => getAccountBillingContext(workspace.ownerId));
  if (!billing) {
    return Response.json({ error: "Merchant account not found" }, { status: 404, headers: EMBED_CORS_HEADERS });
  }
  if (!canUsePaidPlatform(billing)) {
    return Response.json(
      { error: "This store's style assistant subscription is inactive.", code: "subscription_required" },
      { status: 402, headers: EMBED_CORS_HEADERS }
    );
  }
  if (!canStartSessionTurn(billing)) {
    return Response.json(
      { error: "This store has reached its session limit.", code: "wallet_limit" },
      { status: 402, headers: EMBED_CORS_HEADERS }
    );
  }

  let geminiApiKey: string;
  try {
    geminiApiKey = getPlatformGeminiApiKey();
  } catch {
    return Response.json(
      { error: "This store's style assistant is temporarily unavailable.", code: "chat_unavailable" },
      { status: 503, headers: EMBED_CORS_HEADERS }
    );
  }

  const profile =
    shopper && typeof body.profileId === "string" && body.profileId
      ? await getShopperProfile(shopper.account.id, body.profileId)
      : null;
  const measurements = profile
    ? {
        heightCm: profile.heightCm,
        chestCm: profile.chestCm,
        waistCm: profile.waistCm,
        hipsCm: profile.hipsCm,
        shoeSizeEu: profile.shoeSizeEu,
      }
    : body.measurements;
  if (!hasBodyMeasurements(measurements)) {
    return Response.json(
      { error: "Please add your measurements to continue.", code: "measurements_required" },
      { status: 400, headers: EMBED_CORS_HEADERS }
    );
  }

  const history = Array.isArray(body.messages) ? body.messages : [];
  const meter = createSessionMeter();
  const requestId = randomUUID();
  const context = await buildAgentContext({
    ownerId: workspace.ownerId,
    // The signed-in shopper, not a browser-chosen id: it is what ACS learns this shopper's
    // behaviour under, and a value the client controls could be anyone's.
    visitorId: shopper ? `shopper-${shopper.account.id}` : sessionId,
    usageSource: "store",
    geminiApiKey,
    meter,
    messages: history,
    audience: profile?.audience ?? body.audience,
    measurements,
    budget: body.budget,
    retrievalState: body.retrievalState,
    attachment: body.attachment,
    trigger: body.trigger,
    referencedItemId: body.referencedItemId,
    signal: req.signal,
  });

  const stream = agentEventStream(
    dispatchTurn(context),
    req.signal,
    () =>
      flushSessionMeter({
        meter,
        ownerId: workspace.ownerId,
        sessionId,
        history,
        requestId,
        cycleStartIso: billing.cycleStartIso,
        includedAllowance: billing.tier.monthlySessionUnits,
        source: "store",
      }),
    "api/embed/wearable POST"
  );

  return new Response(stream, { headers: { ...EMBED_CORS_HEADERS, ...SSE_HEADERS } });
}
