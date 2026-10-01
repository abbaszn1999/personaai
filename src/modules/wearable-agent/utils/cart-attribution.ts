import type { ChatMessage, TurnAttribution } from "@/modules/commerce/types";

/**
 * The most recent assistant turn that put this product in front of the shopper — as a card or
 * inside a look — with the look it came from. Null when the chat never showed it (added from the
 * product stack or a try-on).
 */
export function attributionForProduct(
  messages: readonly ChatMessage[],
  productId: string
): { attribution: TurnAttribution; lookId: string | null } | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== "assistant" || !message.attribution) continue;
    const look = message.bundles?.find((bundle) => bundle.productIds.includes(productId));
    if (look) return { attribution: message.attribution, lookId: look.id };
    if (message.productRecommendations?.includes(productId)) return { attribution: message.attribution, lookId: null };
  }
  return null;
}
