import type { ToolDefinition } from "@/lib/ai/gemini-chat";
import {
  generateTryOnImage,
  mergeOutfitGarments,
  PersonaAgentError,
  type TryOnGarmentRef,
} from "@/lib/agents/persona-agent";
import { recordDetailPageViewEvent } from "@/lib/catalog/acs/user-events";
import { consumeImageGeneration } from "@/lib/db/image-generations";
import { getUserById } from "@/lib/db/users";
import { canGenerateImage, getAccountBillingContext } from "@/lib/billing/account";
import { tryOnCostNanos } from "@/lib/billing/pricing";
import { mergeGarmentIntoOutfit } from "@/lib/recommendations";
import type { Product } from "@/modules/commerce/types";
import { resolveGarmentSlot } from "@/modules/wearable-agent/utils/fit-metrics";
import { buildFitNote, recommendSizesForProducts } from "../../fit-analysis";
import type { ToolRuntimeState, WearableAgentEvent, WearableChatContext } from "../types";

function toGarmentRef(product: Product): TryOnGarmentRef {
  return { name: product.name, slot: resolveGarmentSlot(product), imageUrl: product.imageUrl };
}

export const tryOnTool: ToolDefinition = {
  type: "function",
  name: "try_on",
  description:
    "Renders the shopper's avatar and returns a photorealistic preview. Pass only the new or replacement product ids: each item replaces the current garment in the same slot while unrelated garments stay on (new shoes replace shoes but keep the shirt/pants/jacket). Omit productIds to render the current outfit unchanged. Consumes one image credit per garment in the rendered outfit — only call when the shopper explicitly asks to see/try on/preview something.",
  parameters: {
    type: "object",
    properties: {
      productIds: {
        type: "array",
        items: { type: "string" },
        description:
          "Ids of only the products being added or replaced; they merge into the current outfit by garment slot. Omit to render the current outfit as-is.",
      },
    },
  },
};

export async function handleTryOn(
  args: Record<string, unknown>,
  context: WearableChatContext,
  runtime: ToolRuntimeState
): Promise<{ resultForModel: string; events: WearableAgentEvent[] }> {
  const requestedIds = Array.isArray(args.productIds)
    ? (args.productIds as unknown[]).filter((id): id is string => typeof id === "string")
    : [];

  const explicitItems = requestedIds
    .map((id) => runtime.knownProducts.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const previousItems = context.outfitItems;
  const items =
    explicitItems.length > 0
      ? mergeGarmentIntoOutfit(previousItems, explicitItems)
      : previousItems;

  // Only trust the avatar photo to already show `previousItems` when this call explicitly
  // named new/replacement products — otherwise (e.g. the very first render for an outfit
  // built without a prior try_on) we can't assume anything is actually pictured yet, so
  // everything renders fresh instead of risking a "keep as shown" instruction for garments
  // that aren't really on the avatar image.
  const previousIds = new Set(previousItems.map((p) => p.id));
  const kept = explicitItems.length > 0 ? items.filter((p) => previousIds.has(p.id)) : [];
  const added = explicitItems.length > 0 ? items.filter((p) => !previousIds.has(p.id)) : items;

  if (items.length === 0) {
    return {
      resultForModel: JSON.stringify({ error: "No items to try on yet — search for or add something to the outfit first." }),
      events: [],
    };
  }

  if (!context.profile.avatarUrl) {
    return { resultForModel: JSON.stringify({ error: "No avatar is set up yet." }), events: [] };
  }

  const outfit = mergeOutfitGarments(kept.map(toGarmentRef), added.map(toGarmentRef));
  const billing = await getAccountBillingContext(context.userId);
  if (!billing || !canGenerateImage(billing, tryOnCostNanos(outfit.length))) {
    return {
      resultForModel: JSON.stringify({ error: "The shopper doesn't have enough image credits for this outfit — one credit per garment. Let them know they'll need more credits to generate a preview." }),
      events: [],
    };
  }

  try {
    const { imageUrl, garmentCount } = await generateTryOnImage({
      avatarImageUrl: context.profile.avatarUrl,
      kept: kept.map(toGarmentRef),
      added: added.map(toGarmentRef),
    });

    const consumed = await consumeImageGeneration(
      context.userId,
      "try_on",
      billing.cycleStartIso,
      billing.tier.monthlyGarmentUnits,
      tryOnCostNanos(garmentCount),
      {
        sessionId: context.visitorId,
        source: context.usageSource ?? (context.visitorId === context.userId ? "preview" : "store"),
      }
    );
    if (consumed === null) throw new PersonaAgentError("The account's image allowance is exhausted.");
    runtime.creditsRemaining = (await getUserById(context.userId))?.credits ?? runtime.creditsRemaining;

    const recommendedSizes = recommendSizesForProducts(context.profile, items);
    const fitNotes = buildFitNote(context.profile);

    if (context.connection) {
      for (const item of items) {
        void recordDetailPageViewEvent({
          connectionId: context.connection.id,
          visitorId: context.visitorId,
          externalId: item.id,
          attributionToken: runtime.lastAttributionToken,
        });
      }
    }

    return {
      resultForModel: JSON.stringify({ success: true, itemCount: items.length }),
      events: [
        {
          type: "try_on",
          imageUrl,
          items: items.map((p) => ({ productId: p.id, name: p.name, selectedVariant: recommendedSizes[p.id] })),
          recommendedSizes,
          fitNotes,
        },
        { type: "credits", creditsRemaining: runtime.creditsRemaining },
      ],
    };
  } catch (err) {
    console.error("[persona try_on]", err);
    const message = err instanceof PersonaAgentError ? err.message : "Failed to generate the try-on render.";
    return { resultForModel: JSON.stringify({ error: message }), events: [] };
  }
}
