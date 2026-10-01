import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getPlatformGeminiApiKey } from "@/lib/ai/gemini";
import { dispatchTurn } from "@/lib/agents/dispatch";
import { buildAgentContext, type AgentRequestState } from "@/lib/agents/shared/context";
import { agentEventStream, SSE_HEADERS } from "@/lib/agents/sse";
import type { ChatMessage } from "@/modules/commerce/types";
import { canStartSessionTurn, canUsePaidPlatform, getAccountBillingContext } from "@/lib/billing/account";
import { flushSessionMeter } from "@/lib/billing/flush-session-meter";
import { createSessionMeter } from "@/lib/billing/session-meter";

export const maxDuration = 60;

interface AgentChatRequestBody {
  messages?: ChatMessage[];
  /** The shopper profile's audience (`woman`, `man`, `kids-girl`, …) — sets the department. */
  audience?: string | null;
  /** The profile's onboarding measurements; every search returns only products that fit them. */
  measurements?: unknown;
  /** The optional budget field for a full look. */
  budget?: number | null;
  /** State the client received on the previous turn and echoes back. */
  retrievalState?: AgentRequestState;
  /** What the shopper attached: `{ kind: "item", productId }` or `{ kind: "look", look }`. */
  attachment?: unknown;
  /** A click that starts a turn on its own: `{ type: "complete_look", productId }`. */
  trigger?: unknown;
  /** A product this message is about, when the client knows it (e.g. a tapped card). */
  referencedItemId?: unknown;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const billing = await getAccountBillingContext(user.id);
  if (!billing || !canUsePaidPlatform(billing)) {
    return Response.json(
      { error: "An active subscription is required.", code: "subscription_required" },
      { status: 402 }
    );
  }
  if (!canStartSessionTurn(billing)) {
    return Response.json(
      { error: "Session usage has reached this plan's limit.", code: "wallet_limit" },
      { status: 402 }
    );
  }

  let geminiApiKey: string;
  try {
    geminiApiKey = getPlatformGeminiApiKey();
  } catch {
    return Response.json(
      { error: "Chat is temporarily unavailable. Please try again later.", code: "chat_unavailable" },
      { status: 503 }
    );
  }

  const body: AgentChatRequestBody = await req.json().catch(() => ({}));
  const history = Array.isArray(body.messages) ? body.messages : [];

  const meter = createSessionMeter();
  const context = await buildAgentContext({
    ownerId: user.id,
    // The dashboard preview is the merchant's own authenticated account — already a stable id.
    visitorId: user.id,
    usageSource: "preview",
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
        ownerId: user.id,
        sessionId: user.id,
        history,
        cycleStartIso: billing.cycleStartIso,
        includedAllowance: billing.tier.monthlySessionUnits,
        source: "preview",
      }),
    "api/agents/wearable POST"
  );

  return new Response(stream, { headers: SSE_HEADERS });
}
