import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { sessionOptions, type SessionData } from "@/modules/auth/lib/session";
import { getOpenaiApiKeyEncrypted } from "@/lib/db/users";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { decryptSecret } from "@/lib/utils/crypto";
import { runWearableChatAgent, type WearableChatContext, type IntakeState } from "@/lib/agents/wearable-chat-agent";
import { getWearableAvatar, rememberWearableAvatar } from "@/lib/agents/wearable-chat-agent/avatar-cache";
import type { ChatMessage, Product } from "@/modules/shopping-agent/types";
import { canUsePaidPlatform, getAccountBillingContext } from "@/lib/billing/account";

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
  const billing = await getAccountBillingContext(user.id, "wearable");
  if (!billing || !canUsePaidPlatform(billing)) {
    return Response.json(
      { error: "An active subscription is required.", code: "subscription_required" },
      { status: 402 }
    );
  }

  const encryptedKey = await getOpenaiApiKeyEncrypted(user.id);
  if (!encryptedKey) {
    return Response.json(
      { error: "Add your OpenAI API key in Account Settings to chat with the Style Assistant.", code: "missing_openai_key" },
      { status: 400 }
    );
  }

  let openaiApiKey: string;
  try {
    openaiApiKey = decryptSecret(encryptedKey);
  } catch {
    return Response.json(
      { error: "Your saved OpenAI API key couldn't be read — please re-enter it in Account Settings.", code: "missing_openai_key" },
      { status: 400 }
    );
  }

  const body: WearableChatRequestBody = await req.json().catch(() => ({}));
  const history = Array.isArray(body.messages) ? body.messages : [];
  const profileInput = body.profile ?? {};
  const outfitItems = Array.isArray(body.outfitItems) ? body.outfitItems : [];
  const knownProducts = Array.isArray(body.knownProducts) ? body.knownProducts : [];
  const intake = body.intake ?? {};

  // Cache any newly provided avatar/photo so later turns stay under the body-size limit.
  if (profileInput.avatarUrl || profileInput.photoBase64) {
    rememberWearableAvatar(user.id, {
      avatarUrl: profileInput.avatarUrl,
      photoBase64: profileInput.photoBase64,
      photoMimeType: profileInput.photoMimeType,
    });
  }
  const cached = getWearableAvatar(user.id);

  const connection = await getStoreConnectionByOwner(user.id);
  const activeCategories = connection
    ? connection.categories.filter((c) => connection.selectedCategoryIds.includes(c.id))
    : [];

  const context: WearableChatContext = {
    userId: user.id,
    openaiApiKey,
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
    outfitItems,
    knownProducts,
    intake,
    storeProductCount: connection?.productCount ?? 0,
    categories: activeCategories,
  };

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
