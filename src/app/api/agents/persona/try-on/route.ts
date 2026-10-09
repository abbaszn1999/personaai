import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { consumeImageGeneration } from "@/lib/db/image-generations";
import { getUserById } from "@/lib/db/users";
import { canGenerateImage, getAccountBillingContext } from "@/lib/billing/account";
import { estimateTryOnCostNanos } from "@/lib/billing/pricing";
import { generateTryOnImage, PersonaAgentError } from "@/lib/try-on/image-generation";
import { parseTryOnGarments } from "@/lib/try-on/request";
import { GeminiImageError } from "@/lib/ai/gemini-image";

/** A render takes ~12-25s; the headroom covers a slow model call plus its one retry. */
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const billing = await getAccountBillingContext(user.id);
    if (!billing) {
      return Response.json({ error: "Your monthly image allowance and purchased credits are exhausted" }, { status: 402 });
    }

    const body = await req.json();
    const { avatarImageUrl } = body;

    if (typeof avatarImageUrl !== "string" || !avatarImageUrl) {
      return Response.json({ error: "An avatar image is required" }, { status: 400 });
    }
    const added = parseTryOnGarments(body);
    if (!added) {
      return Response.json({ error: "At least one garment image is required" }, { status: 400 });
    }

    // Only a gate: it stops an account that cannot afford a render from starting one. What is
    // charged afterwards is the real cost of the call, not this estimate.
    if (!canGenerateImage(billing, estimateTryOnCostNanos(added.length))) {
      return Response.json({ error: "Your monthly image allowance and purchased credits are exhausted" }, { status: 402 });
    }

    const { imageUrl, costNanos } = await generateTryOnImage({
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
    if (consumed === null) {
      return Response.json({ error: "Your monthly image allowance and purchased credits are exhausted" }, { status: 402 });
    }
    const refreshedUser = await getUserById(user.id);
    const creditsRemaining = refreshedUser?.credits ?? billing.user.credits;

    return Response.json({ imageUrl, creditsRemaining });
  } catch (err) {
    console.error("[agents/persona/try-on POST]", err);
    if (err instanceof PersonaAgentError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof GeminiImageError) {
      return Response.json({ error: err.message }, { status: 502 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
