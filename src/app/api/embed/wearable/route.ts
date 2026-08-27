import { NextRequest } from "next/server";
import { getGeminiApiKeyEncrypted, getUserById } from "@/lib/db/users";
import { decryptSecret } from "@/lib/utils/crypto";
import { runWearableChatAgent, type WearableChatContext, type IntakeState } from "@/lib/agents/wearable/persona";
import { buildWearableChatContext } from "@/lib/agents/wearable/persona/context";
import type { BundleState } from "@/lib/retrieval/types";
import { getWearableAvatar, rememberWearableAvatar } from "@/lib/agents/wearable/persona/avatar-cache";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedOptions, EMBED_CORS_HEADERS } from "@/lib/embed/cors";
import type { ChatMessage, Product } from "@/modules/shopping-agent/types";
import { canUsePaidPlatform, getAccountBillingContext } from "@/lib/billing/account";

export const maxDuration = 60;

interface EmbedWearableRequestBody {
  embedToken?: string;
  /** Random id the shopper's browser generates once and persists in localStorage — this app
   *  has no shopper login, so it's the only way to key the ephemeral avatar cache per-shopper
   *  instead of per-merchant (many concurrent shoppers can share one embed token). */
  sessionId?: string;
  messages?: ChatMessage[];
  profile?: {
    heightCm?: number | null;
    weightKg?: number | null;
    chestCm?: number | null;
    waistCm?: number | null;
    shoeSizeEu?: number | null;
    avatarUrl?: string | null;
    photoBase64?: string | null;
    photoMimeType?: string | null;
    isCustomAvatar?: boolean;
  };
  outfitItems?: Product[];
  /** Ids only — the server rehydrates them from the indexed catalog. */
  knownProductIds?: string[];
  intake?: IntakeState;
  retrievalState?: {
    anchorId?: string | null;
    anchorPinned?: boolean;
    bundleState?: BundleState | null;
    shownProductIds?: string[];
  };
}

function sseLine(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function OPTIONS() {
  return embedOptions();
}

export async function POST(req: NextRequest) {
  const body: EmbedWearableRequestBody = await req.json().catch(() => ({}));

  const resolution = await resolveEmbedRequest(body.embedToken, "wearable");
  if ("error" in resolution) return resolution.error;
  const { workspace } = resolution;

  const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : "anonymous";
  const avatarCacheKey = `embed:${body.embedToken}:${sessionId}`;

  const user = await getUserById(workspace.ownerId);
  if (!user) {
    return Response.json({ error: "Merchant account not found" }, { status: 404, headers: EMBED_CORS_HEADERS });
  }
  const billing = await getAccountBillingContext(workspace.ownerId, "wearable");
  if (!billing || !canUsePaidPlatform(billing)) {
    return Response.json(
      { error: "This store's style assistant subscription is inactive.", code: "subscription_required" },
      { status: 402, headers: EMBED_CORS_HEADERS }
    );
  }

  const encryptedKey = await getGeminiApiKeyEncrypted(workspace.ownerId);
  if (!encryptedKey) {
    return Response.json(
      { error: "This store hasn't finished setting up its style assistant yet.", code: "missing_api_key" },
      { status: 400, headers: EMBED_CORS_HEADERS }
    );
  }

  let geminiApiKey: string;
  try {
    geminiApiKey = decryptSecret(encryptedKey);
  } catch {
    return Response.json(
      { error: "This store's style assistant is temporarily unavailable.", code: "missing_api_key" },
      { status: 400, headers: EMBED_CORS_HEADERS }
    );
  }

  const history = Array.isArray(body.messages) ? body.messages : [];
  const profileInput = body.profile ?? {};
  const outfitItems = Array.isArray(body.outfitItems) ? body.outfitItems : [];
  const knownProductIds = Array.isArray(body.knownProductIds) ? body.knownProductIds : [];
  const intake = body.intake ?? {};
  const retrievalState = body.retrievalState ?? {};

  if (profileInput.avatarUrl || profileInput.photoBase64) {
    rememberWearableAvatar(avatarCacheKey, {
      avatarUrl: profileInput.avatarUrl,
      photoBase64: profileInput.photoBase64,
      photoMimeType: profileInput.photoMimeType,
    });
  }
  const cached = getWearableAvatar(avatarCacheKey);

  const context: WearableChatContext = await buildWearableChatContext({
    ownerId: workspace.ownerId,
    // The browser-generated session id already used to key the avatar cache — a stable
    // per-shopper id without requiring shopper login, exactly what ACS's visitorId wants.
    visitorId: sessionId,
    geminiApiKey,
    creditsRemaining: billing.user.credits,
    profile: {
      heightCm: profileInput.heightCm ?? null,
      weightKg: profileInput.weightKg ?? null,
      chestCm: profileInput.chestCm ?? null,
      waistCm: profileInput.waistCm ?? null,
      shoeSizeEu: profileInput.shoeSizeEu ?? null,
      photoBase64: profileInput.photoBase64 ?? cached?.photoBase64 ?? null,
      photoMimeType: profileInput.photoMimeType ?? cached?.photoMimeType ?? null,
      avatarUrl: profileInput.avatarUrl ?? cached?.avatarUrl ?? null,
      isCustomAvatar: profileInput.isCustomAvatar ?? false,
    },
    history,
    outfitItems,
    knownProductIds,
    intake,
    retrievalState,
  });

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
        for await (const event of runWearableChatAgent(context, history)) {
          if (closed || req.signal.aborted) break;

          if (event.type === "profile" && typeof event.patch.avatarUrl === "string") {
            rememberWearableAvatar(avatarCacheKey, { avatarUrl: event.patch.avatarUrl });
          }
          safeEnqueue(encoder.encode(sseLine(event)));
        }
      } catch (err) {
        if (!closed && !req.signal.aborted) {
          console.error("[api/embed/wearable POST]", err);
          safeEnqueue(
            encoder.encode(sseLine({ type: "error", message: "The style assistant hit an unexpected error." }))
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
