import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { consumeImageGeneration } from "@/lib/db/image-generations";
import { getUserById } from "@/lib/db/users";
import { canGenerateImage, getAccountBillingContext } from "@/lib/billing/account";
import { estimateTryOnCostNanos } from "@/lib/billing/pricing";
import { generateTryOnImage } from "@/lib/try-on/image-generation";
import { parseTryOnGarments } from "@/lib/try-on/request";
import { dedupeRequest, parseRequestId } from "@/lib/try-on/dedupe";
import { toTryOnErrorResponse, tryOnFailure } from "@/lib/try-on/error-response";
import { PersonaAgentError } from "@/lib/try-on/errors";

/**
 * A render takes ~12-30s. The image model gets two attempts inside a 100 s budget (see
 * gemini-image.ts), so this leaves room for fetching the garment pictures on top.
 */
export const maxDuration = 120;

const OUT_OF_ALLOWANCE = "Your monthly image allowance and purchased credits are exhausted";

function failure(code: Parameters<typeof tryOnFailure>[0], message: string) {
  const { status, body } = tryOnFailure(code, message);
  return Response.json(body, { status });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return failure("unauthorized", "Unauthorized");

    const billing = await getAccountBillingContext(user.id);
    if (!billing) return failure("insufficient_balance", OUT_OF_ALLOWANCE);

    const body = await req.json();
    const { avatarImageUrl } = body;

    if (typeof avatarImageUrl !== "string" || !avatarImageUrl) {
      return failure("invalid_request", "An avatar image is required");
    }
    const added = parseTryOnGarments(body);
    if (!added) {
      return failure("invalid_request", "At least one garment image is required");
    }

    // Only a gate: it stops an account that cannot afford a render from starting one. What is
    // charged afterwards is the real cost of the call, not this estimate.
    if (!canGenerateImage(billing, estimateTryOnCostNanos(added.length))) {
      return failure("insufficient_balance", OUT_OF_ALLOWANCE);
    }

    // A retry of the same request joins or reuses the first one rather than billing again.
    const imageUrl = await dedupeRequest(user.id, parseRequestId(body.requestId), async () => {
      const { imageUrl: rendered, costNanos } = await generateTryOnImage({
        avatarImageUrl,
        kept: [],
        added,
      });

      const consumed = await consumeImageGeneration(
        user.id,
        "try_on",
        billing.cycleStartIso,
        billing.tier.monthlyGarmentUnits,
        costNanos,
        { sessionId: user.id, source: "preview" }
      );
      if (consumed === null) throw new PersonaAgentError(OUT_OF_ALLOWANCE, "insufficient_balance");
      return rendered;
    });

    const refreshedUser = await getUserById(user.id);
    const creditsRemaining = refreshedUser?.credits ?? billing.user.credits;

    return Response.json({ imageUrl, creditsRemaining });
  } catch (err) {
    console.error("[agents/persona/try-on POST]", err);
    const { status, body } = toTryOnErrorResponse(err);
    return Response.json(body, { status });
  }
}
