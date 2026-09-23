import { NextRequest } from "next/server";
import { getUserById } from "@/lib/db/users";
import { consumeImageGeneration } from "@/lib/db/image-generations";
import { canGenerateImage, getAccountBillingContext } from "@/lib/billing/account";
import { generateTryOnImage, mergeOutfitGarments, PersonaAgentError } from "@/lib/agents/persona-agent";
import { PrunaApiError } from "@/lib/ai/pruna";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedJson, embedOptions } from "@/lib/embed/cors";

export async function OPTIONS() {
  return embedOptions();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const resolution = await resolveEmbedRequest(body.embedToken);
    if ("error" in resolution) return resolution.error;
    const { workspace } = resolution;

    const user = await getUserById(workspace.ownerId);
    if (!user) {
      return embedJson({ error: "Merchant account not found" }, { status: 404 });
    }
    const billing = await getAccountBillingContext(workspace.ownerId);
    if (!billing) {
      return embedJson({ error: "This store has exhausted its monthly image allowance and purchased credits" }, { status: 402 });
    }

    const { avatarImageUrl, garmentImageUrls } = body;

    if (typeof avatarImageUrl !== "string" || !avatarImageUrl) {
      return embedJson({ error: "An avatar image is required" }, { status: 400 });
    }
    if (
      !Array.isArray(garmentImageUrls) ||
      garmentImageUrls.length === 0 ||
      !garmentImageUrls.every((u) => typeof u === "string")
    ) {
      return embedJson({ error: "At least one garment image is required" }, { status: 400 });
    }

    const added = garmentImageUrls.map((url: string) => ({
      name: "garment",
      slot: "other" as const,
      imageUrl: url,
    }));
    if (!canGenerateImage(billing, mergeOutfitGarments([], added).length)) {
      return embedJson({ error: "This store has exhausted its monthly image allowance and purchased credits" }, { status: 402 });
    }

    const { imageUrl, garmentCount } = await generateTryOnImage({
      avatarImageUrl,
      kept: [],
      added,
    });

    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const consumed = await consumeImageGeneration(
      workspace.ownerId,
      "try_on",
      billing.cycleStartIso,
      billing.tier.monthlyGarmentUnits,
      garmentCount,
      { sessionId: sessionId || null, source: "store" }
    );
    if (!consumed) {
      return embedJson({ error: "This store has exhausted its monthly image allowance and purchased credits" }, { status: 402 });
    }
    const refreshedUser = await getUserById(workspace.ownerId);
    const creditsRemaining = refreshedUser?.credits ?? user.credits;

    return embedJson({ imageUrl, creditsRemaining });
  } catch (err) {
    console.error("[api/embed/persona/try-on POST]", err);
    if (err instanceof PersonaAgentError) {
      return embedJson({ error: err.message }, { status: 400 });
    }
    if (err instanceof PrunaApiError) {
      return embedJson({ error: err.message }, { status: 502 });
    }
    return embedJson({ error: "Internal server error" }, { status: 500 });
  }
}
