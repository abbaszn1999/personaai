import { createChatCompletion, type ChatCompletionMessage, type ToolDefinition } from "@/lib/ai/openai";
import { rankAndSelectTopK } from "@/lib/recommendations";
import type { RankingContext } from "@/lib/recommendations";
import type { Product } from "@/modules/shopping-agent/types";
import { GARMENT_CATEGORIES, isGarmentCategory, resolveGarmentSlot, type GarmentCategory } from "@/modules/wearable-agent/utils/fit-metrics";
import type { CatalogMatchType } from "@/lib/catalog/search-catalog";
import type { IntakeState, WearableChatProfileContext } from "../types";
import type { StoreCategory } from "@/modules/store/types";
import { filterToRequestedGarmentCategory } from "./category-consistency";
import { classifyGarmentSlots, cacheGarmentSlot } from "./classify-garment";

export interface SelectProductsInput {
  /** Full candidate pool fetched from the store (up to CATALOG_SEARCH_POOL_SIZE). */
  pool: Product[];
  query: string;
  categoryId?: string;
  /** Max picks to return — never more than this even if the model returns more. */
  limit: number;
  apiKey: string;
  profile: WearableChatProfileContext;
  intake: IntakeState;
  matchType: CatalogMatchType;
  categories: StoreCategory[];
  outfitItems?: Product[];
}

export interface SelectProductsResult {
  products: Product[];
  /** True when the AI selection call failed/timed out/returned nothing usable and the
   *  deterministic rankAndSelectTopK pipeline was used instead. */
  usedFallback: boolean;
}

const selectProductsTool: ToolDefinition = {
  type: "function",
  name: "select_products",
  description:
    "Reads the full candidate product list and picks only the best matches for the shopper, ranked best-first, each tagged with its garment slot.",
  parameters: {
    type: "object",
    properties: {
      selections: {
        type: "array",
        description: "Best-first ordered picks — return at most the requested count, never the whole input list.",
        items: {
          type: "object",
          properties: {
            productId: { type: "string", description: "The product's id, copied exactly from the input list." },
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
    required: ["selections"],
  },
};

function formatProductLine(p: Product): string {
  const tags = p.tags.length > 0 ? p.tags.join(", ") : "none";
  const description = p.description ? p.description.slice(0, 200) : "none";
  const sizes = [...new Set(p.variants.filter((v) => v.type === "size").map((v) => v.label))];
  return `- id: ${p.id} | name: "${p.name}" | price: ${p.price} ${p.currency} | inStock: ${p.inStock} | sizes: ${sizes.join(", ") || "n/a"} | category: ${p.categoryId || "none"} | tags: ${tags} | description: ${description}`;
}

function buildSelectionPrompt(input: SelectProductsInput): string {
  const lines: string[] = [
    `Shopper's search query: "${input.query}"`,
  ];
  if (input.intake.style) lines.push(`Stated style preference: ${input.intake.style}`);
  if (input.intake.occasion) lines.push(`Stated occasion: ${input.intake.occasion}`);
  if (input.intake.budget) lines.push(`Stated budget: ${input.intake.budget}`);
  if (input.outfitItems && input.outfitItems.length > 0) {
    const worn = input.outfitItems.map((p) => `${p.name} (${resolveGarmentSlot(p)})`).join(", ");
    lines.push(`Shopper is already wearing: ${worn} — prefer picks that complement these rather than duplicate the same slot.`);
  }
  lines.push(
    `Pick at most ${input.limit} products from the list below that best match the shopper's request, ordered best match first. Call select_products with your picks — never return more than ${input.limit}.`,
    "Candidate products:",
    ...input.pool.map(formatProductLine)
  );
  return lines.join("\n");
}

/**
 * Falls all the way back to today's deterministic pipeline — AI classification of every pool
 * product, rule-based category filtering, then rule-based ranking — used whenever the AI
 * selection call above fails, times out, or returns nothing usable. Never throws.
 */
async function fallbackSelect(input: SelectProductsInput): Promise<Product[]> {
  const slots = await classifyGarmentSlots(input.pool, input.apiKey);
  const classified: Product[] = input.pool.map((p) => {
    const slot = slots.get(p.id);
    return slot ? { ...p, garmentSlot: slot } : p;
  });

  const consistent = filterToRequestedGarmentCategory(classified, `${input.categoryId ?? ""} ${input.query}`);

  const ctx: RankingContext = {
    profile: input.profile,
    intake: input.intake,
    query: input.query,
    matchType: input.matchType,
    categories: input.categories,
    outfitItems: input.outfitItems,
  };
  return rankAndSelectTopK(consistent, ctx, input.limit);
}

/**
 * Replaces the classify-everything + rule-based-rank pipeline with a single AI call that reads
 * the whole candidate pool (up to CATALOG_SEARCH_POOL_SIZE) but only ever has to write out the
 * handful of winning picks — output stays small regardless of how large the pool is, unlike
 * classifyGarmentSlots which must emit one entry per input product. Falls back to the exact
 * previous pipeline (fallbackSelect above) on any failure so a slow/broken AI call never means
 * the shopper sees nothing.
 */
export async function selectTopProducts(input: SelectProductsInput): Promise<SelectProductsResult> {
  if (input.pool.length === 0) {
    return { products: [], usedFallback: false };
  }

  if (!input.apiKey) {
    return { products: await fallbackSelect(input), usedFallback: true };
  }

  try {
    const messages: ChatCompletionMessage[] = [
      {
        role: "system",
        content:
          "You are a precise personal shopping assistant. You are given a shopper's request and a list of candidate products. " +
          "Select and rank only the best-matching subset — never restate every product. Always respond by calling the provided tool.",
      },
      { role: "user", content: buildSelectionPrompt(input) },
    ];

    const { toolCalls } = await createChatCompletion(input.apiKey, messages, {
      tools: [selectProductsTool],
      toolChoice: { type: "function", name: "select_products" },
      // Input can be large (up to ~200 products), but output is bounded to `limit` entries —
      // typically faster than classifyGarmentSlots' 30s despite the bigger prompt, since output
      // token count (the slow part) doesn't scale with pool size here.
      timeoutMs: 25_000,
    });

    const call = toolCalls.find((tc) => tc.function.name === "select_products");
    if (!call) return { products: await fallbackSelect(input), usedFallback: true };

    const parsed = JSON.parse(call.function.arguments) as {
      selections?: Array<{ productId?: unknown; slot?: unknown }>;
    };
    const selections = Array.isArray(parsed.selections) ? parsed.selections : [];

    const byId = new Map(input.pool.map((p) => [p.id, p]));
    const seen = new Set<string>();
    const picked: Product[] = [];

    for (const entry of selections) {
      if (picked.length >= input.limit) break;
      if (typeof entry.productId !== "string" || !isGarmentCategory(entry.slot)) continue;
      if (seen.has(entry.productId)) continue;
      const product = byId.get(entry.productId);
      if (!product) continue;

      seen.add(entry.productId);
      cacheGarmentSlot(entry.productId, entry.slot);
      picked.push({ ...product, garmentSlot: entry.slot });
    }

    if (picked.length === 0) {
      return { products: await fallbackSelect(input), usedFallback: true };
    }

    // Cheap rule-based safety net — the AI is told the requested category/query, but this
    // guards against it slipping in an obvious mismatch anyway.
    const consistent = filterToRequestedGarmentCategory(picked, `${input.categoryId ?? ""} ${input.query}`);
    return { products: consistent.slice(0, input.limit), usedFallback: false };
  } catch (err) {
    console.error("[wearable-chat-agent selectTopProducts]", err);
    return { products: await fallbackSelect(input), usedFallback: true };
  }
}
