import { createChatCompletion, type ChatCompletionMessage, type ToolDefinition } from "@/lib/ai/openai";
import type { Product } from "@/modules/shopping-agent/types";
import { GARMENT_CATEGORIES, isGarmentCategory, type GarmentCategory } from "@/modules/wearable-agent/utils/fit-metrics";
import { isCacheDisabled } from "@/lib/utils/disable-cache";

/**
 * Ephemeral in-memory cache keyed by product id — same "temp for now, lives only in this
 * process's memory" trade-off as backdrop-cache.ts. Once a product has been classified it
 * never needs a model call again; the classified slot also travels with the Product object
 * itself once attached, so this cache mostly matters for products re-fetched by id without
 * having gone through search_catalog again.
 */
const slotCache = new Map<string, GarmentCategory>();

/** Test-only hook to reset cache state between cases. */
export function __resetGarmentSlotCacheForTests(): void {
  slotCache.clear();
}

/** Lets other classification paths (e.g. select-products.ts's AI-driven selection) populate
 *  this same shared cache with slots they determined themselves, so later turns/lookups that
 *  only have a product id still benefit even though they went through a different call. */
export function cacheGarmentSlot(productId: string, slot: GarmentCategory): void {
  if (isCacheDisabled()) return;
  slotCache.set(productId, slot);
}

const classifyGarmentsTool: ToolDefinition = {
  type: "function",
  name: "classify_garments",
  description: "Classifies each given product into exactly one garment slot based on its name, description, tags, and category.",
  parameters: {
    type: "object",
    properties: {
      classifications: {
        type: "array",
        description: "One entry per input product, in any order.",
        items: {
          type: "object",
          properties: {
            productId: { type: "string", description: "The product's id, copied exactly from the input." },
            slot: {
              type: "string",
              enum: GARMENT_CATEGORIES,
              description:
                "outerwear = jackets/coats/blazers worn over a top; top = shirts/knits/hoodies; bottom = pants/skirts/shorts; shoes = footwear; dress = one-piece dresses/jumpsuits; other = anything else (accessories, bags, hats, etc).",
            },
          },
          required: ["productId", "slot"],
        },
      },
    },
    required: ["classifications"],
  },
};

function buildClassificationPrompt(products: Product[]): string {
  const lines = products.map((p) => {
    const tags = p.tags.length > 0 ? p.tags.join(", ") : "none";
    const description = p.description ? p.description.slice(0, 200) : "none";
    return `- id: ${p.id} | name: "${p.name}" | category: ${p.categoryId || "none"} | tags: ${tags} | description: ${description}`;
  });
  return [
    "Classify each of these products into exactly one garment slot. Call classify_garments with one classification per product id listed below.",
    ...lines,
  ].join("\n");
}

/**
 * Batched AI garment-slot classification — replaces title-only keyword matching with a
 * model call that also sees description/tags/categoryId, so products whose name alone
 * doesn't contain an obvious keyword (e.g. a merchant-specific style name) still classify
 * correctly. Already-cached products are skipped entirely (no repeat model calls).
 *
 * Fails soft: any error, timeout, or malformed response yields whatever was already cached
 * and silently omits the rest from the returned map — callers (via resolveGarmentSlot) fall
 * back to keyword matching for anything missing. This function never throws.
 */
export async function classifyGarmentSlots(products: Product[], apiKey: string): Promise<Map<string, GarmentCategory>> {
  const result = new Map<string, GarmentCategory>();
  const uncached: Product[] = [];
  const cacheDisabled = isCacheDisabled();

  for (const product of products) {
    const cached = cacheDisabled ? undefined : slotCache.get(product.id);
    if (cached) {
      result.set(product.id, cached);
    } else {
      uncached.push(product);
    }
  }

  if (uncached.length === 0 || !apiKey) {
    return result;
  }

  try {
    const messages: ChatCompletionMessage[] = [
      {
        role: "system",
        content: "You are a precise garment-taxonomy classifier for an online fashion catalog. Always respond by calling the provided tool.",
      },
      { role: "user", content: buildClassificationPrompt(uncached) },
    ];

    const { toolCalls } = await createChatCompletion(apiKey, messages, {
      tools: [classifyGarmentsTool],
      toolChoice: { type: "function", name: "classify_garments" },
      // Batches every uncached product in the candidate pool (now up to CATALOG_SEARCH_POOL_SIZE,
      // default 100) into one structured tool call — 10s was tuned for the old ~12-item pool and
      // routinely timed out once the pool grew, silently falling back to keyword matching.
      timeoutMs: 30_000,
    });

    const call = toolCalls.find((tc) => tc.function.name === "classify_garments");
    if (!call) return result;

    const parsed = JSON.parse(call.function.arguments) as { classifications?: Array<{ productId?: unknown; slot?: unknown }> };
    const classifications = Array.isArray(parsed.classifications) ? parsed.classifications : [];

    for (const entry of classifications) {
      if (typeof entry.productId !== "string" || !isGarmentCategory(entry.slot)) continue;
      if (!cacheDisabled) slotCache.set(entry.productId, entry.slot);
      result.set(entry.productId, entry.slot);
    }
  } catch (err) {
    console.error("[wearable-chat-agent classifyGarmentSlots]", err);
    // Swallow — callers fall back to keyword matching for anything not in `result`.
  }

  return result;
}
