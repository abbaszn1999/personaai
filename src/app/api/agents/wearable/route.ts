import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { sessionOptions, type SessionData } from "@/modules/auth/lib/session";
import type { BundleState } from "@/lib/retrieval/types";
import { getPlatformGeminiApiKey } from "@/lib/ai/gemini";
import { runWearableChatAgent, type WearableChatContext, type IntakeState } from "@/lib/agents/wearable/persona";
import { buildWearableChatContext } from "@/lib/agents/wearable/persona/context";
import { getWearableAvatar, rememberWearableAvatar } from "@/lib/agents/wearable/persona/avatar-cache";
import type { ChatMessage, Product } from "@/modules/commerce/types";
import { canUsePaidPlatform, getAccountBillingContext } from "@/lib/billing/account";
import { flushSessionMeter } from "@/lib/billing/flush-session-meter";
import { createSessionMeter } from "@/lib/billing/session-meter";

export const maxDuration = 60;

interface WearableChatRequestBody {
  messages?: ChatMessage[];
  profile?: {
    heightCm?: number | null;
    weightKg?: number | null;
    chestCm?: number | null;
    waistCm?: number | null;
    shoeSizeEu?: number | null;
    /** Only sent when the avatar changed — otherwise the server reuses its ephemeral cache. */
    avatarUrl?: string | null;
    photoBase64?: string | null;
    photoMimeType?: string | null;
    isCustomAvatar?: boolean;
  };
  outfitItems?: Product[];
  /** Ids only. The server rehydrates them from `catalog_products`, so a long conversation
   *  doesn't carry the whole product list back and forth on every turn. */
  knownProductIds?: string[];
  intake?: IntakeState;
  /** Retrieval state the client received on the previous turn and echoes back. */
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

  let geminiApiKey: string;
  try {
    geminiApiKey = getPlatformGeminiApiKey();
  } catch {
    return Response.json(
      { error: "Chat is temporarily unavailable. Please try again later.", code: "chat_unavailable" },
      { status: 503 }
    );
  }

  const body: WearableChatRequestBody = await req.json().catch(() => ({}));
  const history = Array.isArray(body.messages) ? body.messages : [];
  const profileInput = body.profile ?? {};
  const outfitItems = Array.isArray(body.outfitItems) ? body.outfitItems : [];
  const knownProductIds = Array.isArray(body.knownProductIds) ? body.knownProductIds : [];
  const intake = body.intake ?? {};
  const retrievalState = body.retrievalState ?? {};

  // Cache any newly provided avatar/photo so later turns stay under the body-size limit.
  if (profileInput.avatarUrl || profileInput.photoBase64) {
    rememberWearableAvatar(user.id, {
      avatarUrl: profileInput.avatarUrl,
      photoBase64: profileInput.photoBase64,
      photoMimeType: profileInput.photoMimeType,
    });
  }
  const cached = getWearableAvatar(user.id);

  const meter = createSessionMeter();
  const context: WearableChatContext = await buildWearableChatContext({
    ownerId: user.id,
    // The dashboard's chat preview is the merchant's own authenticated account, not an anonymous
    // shopper session — the account id is already stable and unique, so there's no need for a
    // separate per-tab id here the way the embed surface needs one (see dashboardSessionIdRef's
    // comment client-side, which is used for chat-event logging only, not this).
    visitorId: user.id,
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
  context.meter = meter;

  const encoder = new TextEncoder();
  let latestCreditsRemaining = billing.user.credits;

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

      let turnFinished = false;
      try {
        for await (const event of runWearableChatAgent(context, history)) {
          if (closed || req.signal.aborted) break;

          if (event.type === "credits") {
            latestCreditsRemaining = event.creditsRemaining;
          }
          // Keep the avatar cache fresh when update_measurements regenerates it.
          if (event.type === "profile" && typeof event.patch.avatarUrl === "string") {
            rememberWearableAvatar(user.id, { avatarUrl: event.patch.avatarUrl });
          }
          safeEnqueue(encoder.encode(sseLine(event)));
        }
        turnFinished = !closed && !req.signal.aborted;
      } catch (err) {
        // AbortError / closed-controller noise after client disconnect is expected.
        if (!closed && !req.signal.aborted) {
          console.error("[api/agents/wearable POST]", err);
          safeEnqueue(
            encoder.encode(sseLine({ type: "error", message: "The style assistant hit an unexpected error." }))
          );
          safeEnqueue(encoder.encode(sseLine({ type: "done" })));
        }
      } finally {
        req.signal.removeEventListener("abort", onAbort);
        safeClose();
      }

      if (latestCreditsRemaining !== billing.user.credits) {
        try {
          const cookieStore = await cookies();
          const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
          if (session.profile) {
            session.profile.credits = latestCreditsRemaining;
            await session.save();
          }
        } catch (err) {
          console.error("[api/agents/wearable] failed to persist credits to session", err);
        }
      }

      if (turnFinished) {
        await flushSessionMeter({
          meter,
          ownerId: user.id,
          sessionId: user.id,
          history,
          cycleStartIso: billing.cycleStartIso,
        });
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
