import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { consumeImageGeneration } from "@/lib/db/image-generations";
import { getUserById } from "@/lib/db/users";
import { canGenerateImage, getAccountBillingContext } from "@/lib/billing/account";
import { generateTryOnImage, mergeOutfitGarments, PersonaAgentError } from "@/lib/agents/persona-agent";
import { PrunaApiError } from "@/lib/ai/pruna";

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
    const { avatarImageUrl, garmentImageUrls } = body;

    if (typeof avatarImageUrl !== "string" || !avatarImageUrl) {
      return Response.json({ error: "An avatar image is required" }, { status: 400 });
    }
    if (!Array.isArray(garmentImageUrls) || garmentImageUrls.length === 0 || !garmentImageUrls.every((u) => typeof u === "string")) {
      return Response.json({ error: "At least one garment image is required" }, { status: 400 });
    }

    // This standalone REST route only receives raw image URLs (no Product/slot data), so
    // every image is passed through as part of the outfit to render. The billed count is the
    // length after the 11-garment cap, which is what Pruna receives.
    const added = garmentImageUrls.map((url: string) => ({ name: "garment", slot: "other" as const, imageUrl: url }));
    if (!canGenerateImage(billing, mergeOutfitGarments([], added).length)) {
      return Response.json({ error: "Your monthly image allowance and purchased credits are exhausted" }, { status: 402 });
    }

    const { imageUrl, garmentCount } = await generateTryOnImage({
      avatarImageUrl,
      kept: [],
      added,
    });

    const consumed = await consumeImageGeneration(
      user.id,
      "try_on",
      billing.cycleStartIso,
      billing.tier.monthlyGarmentUnits,
      garmentCount
    );
    if (!consumed) {
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
    if (err instanceof PrunaApiError) {
      return Response.json({ error: err.message }, { status: 502 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
