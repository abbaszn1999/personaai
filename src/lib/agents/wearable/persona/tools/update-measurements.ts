import type { ToolDefinition } from "@/lib/ai/gemini-chat";
import { generateAvatarVariations, PersonaAgentError } from "@/lib/agents/persona-agent";
import { consumeImageGeneration } from "@/lib/db/image-generations";
import { getUserById } from "@/lib/db/users";
import { canGenerateImage, getAccountBillingContext } from "@/lib/billing/account";
import type { ToolRuntimeState, WearableAgentEvent, WearableChatContext } from "../types";

const MEASUREMENT_KEYS = ["heightCm", "weightKg", "chestCm", "waistCm", "shoeSizeEu"] as const;

export const updateMeasurementsTool: ToolDefinition = {
  type: "function",
  name: "update_measurements",
  description:
    "Updates the shopper's body measurements when they mention a correction or change, and regenerates their avatar to match. Only include the fields that changed.",
  parameters: {
    type: "object",
    properties: {
      heightCm: { type: "number" },
      weightKg: { type: "number" },
      chestCm: { type: "number" },
      waistCm: { type: "number" },
      shoeSizeEu: { type: "number" },
    },
  },
};

export async function handleUpdateMeasurements(
  args: Record<string, unknown>,
  context: WearableChatContext,
  runtime: ToolRuntimeState
): Promise<{ resultForModel: string; events: WearableAgentEvent[] }> {
  const patch: Partial<Record<(typeof MEASUREMENT_KEYS)[number], number>> = {};
  for (const key of MEASUREMENT_KEYS) {
    const value = args[key];
    if (typeof value === "number" && value > 0) patch[key] = value;
  }

  if (Object.keys(patch).length === 0) {
    return { resultForModel: JSON.stringify({ error: "No valid measurements were provided." }), events: [] };
  }

  runtime.profilePatch = { ...runtime.profilePatch, ...patch };

  // A custom-uploaded photo isn't AI-generated, so there's nothing to regenerate — just save
  // the new numbers, mirroring the same skip the "Edit Model Stats" popup already does.
  if (context.profile.isCustomAvatar) {
    return { resultForModel: JSON.stringify({ success: true, regenerated: false }), events: [{ type: "profile", patch }] };
  }

  const { photoBase64, photoMimeType } = context.profile;
  const billing = await getAccountBillingContext(context.userId, "wearable");
  if (!billing || !canGenerateImage(billing) || !photoBase64 || !photoMimeType) {
    return {
      resultForModel: JSON.stringify({ success: true, regenerated: false, note: "Measurements saved, but the avatar couldn't be regenerated right now." }),
      events: [{ type: "profile", patch }],
    };
  }

  try {
    const nextProfile = { ...context.profile, ...patch };
    const [variation] = await generateAvatarVariations(
      {
        photoBase64,
        photoMimeType,
        heightCm: nextProfile.heightCm ?? 170,
        weightKg: nextProfile.weightKg ?? 65,
        chestCm: nextProfile.chestCm ?? 95,
        waistCm: nextProfile.waistCm ?? 80,
        shoeSizeEu: nextProfile.shoeSizeEu ?? 42,
      },
      1
    );

    const consumed = await consumeImageGeneration(
      context.userId,
      "avatar",
      billing.cycleStartIso,
      billing.tier.monthlyRenders
    );
    if (!consumed) throw new PersonaAgentError("The account's image allowance is exhausted.");
    runtime.creditsRemaining = (await getUserById(context.userId))?.credits ?? runtime.creditsRemaining;

    return {
      resultForModel: JSON.stringify({ success: true, regenerated: true }),
      events: [
        { type: "profile", patch: { ...patch, avatarUrl: variation.imageUrl } },
        { type: "credits", creditsRemaining: runtime.creditsRemaining },
      ],
    };
  } catch (err) {
    console.error("[persona update_measurements]", err);
    const message = err instanceof PersonaAgentError ? err.message : "Failed to regenerate the avatar.";
    return {
      resultForModel: JSON.stringify({ success: true, regenerated: false, note: message }),
      events: [{ type: "profile", patch }],
    };
  }
}
