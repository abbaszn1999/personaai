import { NextRequest } from "next/server";
import { getUserById } from "@/lib/db/users";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { getPlatformGeminiApiKey } from "@/lib/ai/gemini";
import { runUnwearableChatAgent, type UnwearableChatContext, type IntakeState } from "@/lib/agents/unwearable-chat-agent";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedOptions, EMBED_CORS_HEADERS } from "@/lib/embed/cors";
import type { ChatMessage, Product } from "@/modules/shopping-agent/types";
import { canUsePaidPlatform, getAccountBillingContext } from "@/lib/billing/account";

export const maxDuration = 60;

interface EmbedUnwearableRequestBody {
  embedToken?: string;
  /** Random id the shopper's browser generates once and persists in localStorage — kept in
   *  the request shape for parity with the wearable embed route (session-scoped features). */
  sessionId?: string;
  messages?: ChatMessage[];
  knownProducts?: Product[];
  intake?: IntakeState;
}

function sseLine(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function OPTIONS() {
  return embedOptions();
}

export async function POST(req: NextRequest) {
  const body: EmbedUnwearableRequestBody = await req.json().catch(() => ({}));

  const resolution = await resolveEmbedRequest(body.embedToken, "unwearable");
  if ("error" in resolution) return resolution.error;
  const { workspace } = resolution;

  const user = await getUserById(workspace.ownerId);
  if (!user) {
    return Response.json({ error: "Merchant account not found" }, { status: 404, headers: EMBED_CORS_HEADERS });
  }
  const billing = await getAccountBillingContext(workspace.ownerId, "unwearable");
  if (!billing || !canUsePaidPlatform(billing)) {
    return Response.json(
      { error: "This store's shopping assistant subscription is inactive.", code: "subscription_required" },
      { status: 402, headers: EMBED_CORS_HEADERS }
    );
  }

  let geminiApiKey: string;
  try {
    geminiApiKey = getPlatformGeminiApiKey();
  } catch {
    return Response.json(
      { error: "This store's shopping assistant is temporarily unavailable.", code: "chat_unavailable" },
      { status: 503, headers: EMBED_CORS_HEADERS }
    );
  }

  const history = Array.isArray(body.messages) ? body.messages : [];
  const knownProducts = Array.isArray(body.knownProducts) ? body.knownProducts : [];
  const intake = body.intake ?? {};

  const connection = await getStoreConnectionByOwner(workspace.ownerId);
  const activeCategories = connection
    ? connection.categories.filter((c) => connection.selectedCategoryIds.includes(c.id))
    : [];

  const context: UnwearableChatContext = {
    userId: workspace.ownerId,
    geminiApiKey,
    knownProducts,
    intake,
    storeProductCount: connection?.productCount ?? 0,
    categories: activeCategories,
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      };

      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by the runtime / cancel().
        }
      };

      const onAbort = () => {
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };
      req.signal.addEventListener("abort", onAbort, { once: true });

      try {
        for await (const event of runUnwearableChatAgent(context, history)) {
          if (closed || req.signal.aborted) break;
          safeEnqueue(encoder.encode(sseLine(event)));
        }
      } catch (err) {
        if (!closed && !req.signal.aborted) {
          console.error("[api/embed/unwearable POST]", err);
          safeEnqueue(
            encoder.encode(sseLine({ type: "error", message: "The shopping assistant hit an unexpected error." }))
          );
          safeEnqueue(encoder.encode(sseLine({ type: "done" })));
        }
      } finally {
        req.signal.removeEventListener("abort", onAbort);
        safeClose();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...EMBED_CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
