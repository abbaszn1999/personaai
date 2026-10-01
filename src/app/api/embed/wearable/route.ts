import { NextRequest } from "next/server";
import { getUserById } from "@/lib/db/users";
import { getPlatformGeminiApiKey } from "@/lib/ai/gemini";
import { dispatchTurn } from "@/lib/agents/dispatch";
import { buildAgentContext, type AgentRequestState } from "@/lib/agents/shared/context";
import { agentEventStream, SSE_HEADERS } from "@/lib/agents/sse";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedOptions, EMBED_CORS_HEADERS } from "@/lib/embed/cors";
import type { ChatMessage } from "@/modules/commerce/types";
import { canStartSessionTurn, canUsePaidPlatform, getAccountBillingContext } from "@/lib/billing/account";
import { flushSessionMeter } from "@/lib/billing/flush-session-meter";
import { createSessionMeter } from "@/lib/billing/session-meter";

export const maxDuration = 60;

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
}

export async function OPTIONS() {
  return embedOptions();
}

export async function POST(req: NextRequest) {
  const body: EmbedAgentRequestBody = await req.json().catch(() => ({}));

  const resolution = await resolveEmbedRequest(body.embedToken);
  if ("error" in resolution) return resolution.error;
  const { workspace } = resolution;

  const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : "anonymous";

  const user = await getUserById(workspace.ownerId);
  if (!user) {
    return Response.json({ error: "Merchant account not found" }, { status: 404, headers: EMBED_CORS_HEADERS });
  }
  const billing = await getAccountBillingContext(workspace.ownerId);
  if (!billing || !canUsePaidPlatform(billing)) {
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

  const history = Array.isArray(body.messages) ? body.messages : [];
  const meter = createSessionMeter();
  const context = await buildAgentContext({
    ownerId: workspace.ownerId,
    visitorId: sessionId,
    usageSource: "store",
    geminiApiKey,
    meter,
    messages: history,
    audience: body.audience,
    measurements: body.measurements,
    budget: body.budget,
    retrievalState: body.retrievalState,
    attachment: body.attachment,
    trigger: body.trigger,
    referencedItemId: body.referencedItemId,
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
        cycleStartIso: billing.cycleStartIso,
        includedAllowance: billing.tier.monthlySessionUnits,
        source: "store",
      }),
    "api/embed/wearable POST"
  );

  return new Response(stream, { headers: { ...EMBED_CORS_HEADERS, ...SSE_HEADERS } });
}
