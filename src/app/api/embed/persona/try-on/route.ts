import { NextRequest } from "next/server";
import { getUserById } from "@/lib/db/users";
import { consumeImageGeneration } from "@/lib/db/image-generations";
import { canGenerateImage, getAccountBillingContext } from "@/lib/billing/account";
import { estimateTryOnCostNanos } from "@/lib/billing/pricing";
import { generateTryOnImage } from "@/lib/try-on/image-generation";
import { parseTryOnGarments } from "@/lib/try-on/request";
import { dedupeRequest, parseRequestId } from "@/lib/try-on/dedupe";
import { toTryOnErrorResponse, tryOnFailure } from "@/lib/try-on/error-response";
import { PersonaAgentError } from "@/lib/try-on/errors";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedJson, embedOptions } from "@/lib/embed/cors";

/**
 * A render takes ~12-30s. The image model gets two attempts inside a 150 s budget (see
 * gemini-image.ts), so this leaves room for the render queue (up to 30 s) and fetching the garment pictures on top.
 */
export const maxDuration = 240;

const OUT_OF_ALLOWANCE = "This store has exhausted its monthly image allowance and purchased credits";

export async function OPTIONS() {
  return embedOptions();
}

function failure(code: Parameters<typeof tryOnFailure>[0], message: string) {
  const { status, body } = tryOnFailure(code, message);
  return embedJson(body, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const resolution = await resolveEmbedRequest(body.embedToken, { req, kind: "paid" });
    if ("error" in resolution) return resolution.error;
    const { workspace } = resolution;

    const user = await getUserById(workspace.ownerId);
    if (!user) {
      return embedJson({ error: "Merchant account not found" }, { status: 404 });
    }
    const billing = await getAccountBillingContext(workspace.ownerId);
    if (!billing) return failure("insufficient_balance", OUT_OF_ALLOWANCE);

    const { avatarImageUrl } = body;

    if (typeof avatarImageUrl !== "string" || !avatarImageUrl) {
      return failure("invalid_request", "An avatar image is required");
    }
    const added = parseTryOnGarments(body);
    if (!added) {
      return failure("invalid_request", "At least one garment image is required");
    }

    // Only a gate; what is charged afterwards is the real cost of the call.
    if (!canGenerateImage(billing, estimateTryOnCostNanos(added.length))) {
      return failure("insufficient_balance", OUT_OF_ALLOWANCE);
    }

    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";

    // A retry of the same request (the widget resends on a dropped connection) joins or reuses
    // the first one rather than rendering and billing again.
    const result = await dedupeRequest(workspace.ownerId, parseRequestId(body.requestId), async () => {
      const { imageUrl, costNanos } = await generateTryOnImage({
        avatarImageUrl,
        kept: [],
        added,
      });

      const consumed = await consumeImageGeneration(
        workspace.ownerId,
        "try_on",
        billing.cycleStartIso,
        billing.tier.monthlyGarmentUnits,
        costNanos,
        { sessionId: sessionId || null, source: "store" }
      );
      if (consumed === null) throw new PersonaAgentError(OUT_OF_ALLOWANCE, "insufficient_balance");
      return imageUrl;
    });

    const refreshedUser = await getUserById(workspace.ownerId);
    const creditsRemaining = refreshedUser?.credits ?? user.credits;

    return embedJson({ imageUrl: result, creditsRemaining });
  } catch (err) {
    console.error("[api/embed/persona/try-on POST]", err);
    const { status, body } = toTryOnErrorResponse(err);
    return embedJson(body, { status });
  }
}
