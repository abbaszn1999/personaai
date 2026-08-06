import type { ToolDefinition } from "@/lib/ai/openai";
import type { ToolRuntimeState, UnwearableAgentEvent, UnwearableChatContext } from "../types";

export const addToCartTool: ToolDefinition = {
  type: "function",
  name: "add_to_cart",
  description: "Adds the given products to the shopper's cart. Only call when the shopper explicitly asks to add or buy something.",
  parameters: {
    type: "object",
    properties: {
      productIds: { type: "array", items: { type: "string" }, description: "Product ids to add to the cart." },
    },
    required: ["productIds"],
  },
};

export async function handleAddToCart(
  args: Record<string, unknown>,
  _context: UnwearableChatContext,
  runtime: ToolRuntimeState
): Promise<{ resultForModel: string; events: UnwearableAgentEvent[] }> {
  const ids = Array.isArray(args.productIds)
    ? (args.productIds as unknown[]).filter((id): id is string => typeof id === "string")
    : [];
  const products = ids.map((id) => runtime.knownProducts.get(id)).filter((p): p is NonNullable<typeof p> => !!p);

  if (products.length === 0) {
    return { resultForModel: JSON.stringify({ error: "None of those product ids are known — search for the item first." }), events: [] };
  }

  return {
    resultForModel: JSON.stringify({ success: true, added: products.map((p) => p.name) }),
    events: [{ type: "add_to_cart", products }],
  };
}
