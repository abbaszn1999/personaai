import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getGeminiApiKeyEncrypted } from "@/lib/db/users";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { decryptSecret } from "@/lib/utils/crypto";
import { runUnwearableChatAgent, type UnwearableChatContext, type IntakeState } from "@/lib/agents/unwearable-chat-agent";
import type { ChatMessage, Product } from "@/modules/shopping-agent/types";
import { canUsePaidPlatform, getAccountBillingContext } from "@/lib/billing/account";

export const maxDuration = 60;

interface UnwearableChatRequestBody {
  messages?: ChatMessage[];
  knownProducts?: Product[];
  intake?: IntakeState;
}

function sseLine(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const billing = await getAccountBillingContext(user.id, "unwearable");
  if (!billing || !canUsePaidPlatform(billing)) {
    return Response.json(
      { error: "An active subscription is required.", code: "subscription_required" },
      { status: 402 }
    );
  }

  const encryptedKey = await getGeminiApiKeyEncrypted(user.id);
  if (!encryptedKey) {
    return Response.json(
      { error: "Add your Gemini API key in Account Settings to chat with the Shopping Assistant.", code: "missing_api_key" },
      { status: 400 }
    );
  }

  let geminiApiKey: string;
  try {
    geminiApiKey = decryptSecret(encryptedKey);
  } catch {
    return Response.json(
      { error: "Your saved Gemini API key couldn't be read — please re-enter it in Account Settings.", code: "missing_api_key" },
      { status: 400 }
    );
  }

  const body: UnwearableChatRequestBody = await req.json().catch(() => ({}));
  const history = Array.isArray(body.messages) ? body.messages : [];
  const knownProducts = Array.isArray(body.knownProducts) ? body.knownProducts : [];
  const intake = body.intake ?? {};

  const connection = await getStoreConnectionByOwner(user.id);
  const activeCategories = connection
    ? connection.categories.filter((c) => connection.selectedCategoryIds.includes(c.id))
    : [];

  const context: UnwearableChatContext = {
    userId: user.id,
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
          // Client disconnected or the runtime cancelled the stream (e.g. HMR restart).
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
        // AbortError / closed-controller noise after client disconnect is expected.
        if (!closed && !req.signal.aborted) {
          console.error("[api/agents/unwearable POST]", err);
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
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
