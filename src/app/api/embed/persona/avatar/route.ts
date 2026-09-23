import { NextRequest } from "next/server";
import { getUserById } from "@/lib/db/users";
import { consumeImageGeneration } from "@/lib/db/image-generations";
import { canGenerateImage, getAccountBillingContext } from "@/lib/billing/account";
import {
  generateAvatarVariationsStream,
  DEFAULT_AVATAR_VARIATION_COUNT,
} from "@/lib/agents/persona-agent";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedOptions, EMBED_CORS_HEADERS } from "@/lib/embed/cors";

export const maxDuration = 300;

function sseLine(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function OPTIONS() {
  return embedOptions();
}

/**
 * Streams each avatar variation as SSE the moment it finishes generating, instead of one
 * blocking JSON response after the whole (parallel) batch completes — Gemini image calls can
 * easily take well over a minute each, and a single silent multi-minute request is exactly
 * the kind of thing intermediary proxies/tunnels kill before it ever resolves. See
 * generateAvatarVariationsStream for why this is also just a better shopper experience
 * (the widget now waits for the whole batch, then shows every style together).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const resolution = await resolveEmbedRequest(body.embedToken);
  if ("error" in resolution) return resolution.error;
  const { workspace } = resolution;

  const user = await getUserById(workspace.ownerId);
  if (!user) {
    return Response.json({ error: "Merchant account not found" }, { status: 404, headers: EMBED_CORS_HEADERS });
  }
  const billing = await getAccountBillingContext(workspace.ownerId);
  if (!billing || !canGenerateImage(billing)) {
    return Response.json(
      { error: "This store has exhausted its monthly image allowance and purchased credits" },
      { status: 402, headers: EMBED_CORS_HEADERS }
    );
  }

  const { photoBase64, photoMimeType, heightCm, weightKg, chestCm, waistCm, shoeSizeEu, count } = body;

  if (typeof photoBase64 !== "string" || !photoBase64) {
    return Response.json({ error: "A face photo is required" }, { status: 400, headers: EMBED_CORS_HEADERS });
  }
  if (typeof photoMimeType !== "string" || !photoMimeType) {
    return Response.json({ error: "Missing photo mime type" }, { status: 400, headers: EMBED_CORS_HEADERS });
  }
  for (const [key, value] of Object.entries({ heightCm, weightKg, chestCm, waistCm, shoeSizeEu })) {
    if (typeof value !== "number" || value <= 0) {
      return Response.json(
        { error: `Invalid or missing measurement: ${key}` },
        { status: 400, headers: EMBED_CORS_HEADERS }
      );
    }
  }

  const includedRemaining = Math.max(billing.tier.monthlyGarmentUnits - billing.imagesUsedThisCycle, 0);
  const availableGenerations = includedRemaining + billing.user.credits;
  const requestedCount = Math.min(
    typeof count === "number" && count > 0 ? count : DEFAULT_AVATAR_VARIATION_COUNT,
    DEFAULT_AVATAR_VARIATION_COUNT,
    availableGenerations
  );

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

      let creditsRemaining = billing.user.credits;
      let includedRemainingInStream = includedRemaining;
      let successCount = 0;

      try {
        for await (const event of generateAvatarVariationsStream(
          { photoBase64, photoMimeType, heightCm, weightKg, chestCm, waistCm, shoeSizeEu },
          requestedCount
        )) {
          if (closed || req.signal.aborted) break;

          if (event.type === "variation") {
            const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
            const consumed = await consumeImageGeneration(
              workspace.ownerId,
              "avatar",
              billing.cycleStartIso,
              billing.tier.monthlyGarmentUnits,
              1,
              { sessionId: sessionId || null, source: "store" }
            );
            if (consumed) {
              if (includedRemainingInStream > 0) includedRemainingInStream -= 1;
              else creditsRemaining = Math.max(creditsRemaining - 1, 0);
              successCount += 1;
              safeEnqueue(encoder.encode(sseLine({ type: "variation", variation: event.variation, creditsRemaining })));
            }
            // Ran out of credits mid-batch — stop rather than keep "succeeding" for free.
            else break;
          } else {
            safeEnqueue(encoder.encode(sseLine({ type: "variation_error", label: event.label, message: event.message })));
          }
        }

        if (successCount === 0 && !closed && !req.signal.aborted) {
          safeEnqueue(
            encoder.encode(sseLine({ type: "error", message: "Failed to generate any avatar variations. Please try again." }))
          );
        }
      } catch (err) {
        if (!closed && !req.signal.aborted) {
          console.error("[api/embed/persona/avatar POST]", err);
          safeEnqueue(encoder.encode(sseLine({ type: "error", message: "Avatar generation hit an unexpected error." })));
        }
      } finally {
        req.signal.removeEventListener("abort", onAbort);
        safeEnqueue(encoder.encode(sseLine({ type: "done", successCount, creditsRemaining })));
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
