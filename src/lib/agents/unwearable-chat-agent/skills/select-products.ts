import { createChatCompletion, type ChatCompletionMessage, type ToolDefinition } from "@/lib/ai/gemini-chat";
import type { Product } from "@/modules/shopping-agent/types";
import type { CatalogMatchType } from "@/lib/catalog/search-catalog";
import type { StoreCategory } from "@/modules/store/types";
import type { IntakeState } from "../types";
import { rankAndSelectTopK, type RankingContext } from "./rank-products";
import { filterToRequestedCategory } from "./category-consistency";

export interface SelectProductsInput {
  /** Full candidate pool fetched from the store (up to CATALOG_SEARCH_POOL_SIZE). */
  pool: Product[];
  query: string;
  categoryId?: string;
  /** Max picks to return — never more than this even if the model returns more. */
  limit: number;
  apiKey: string;
  intake: IntakeState;
  matchType: CatalogMatchType;
  categories: StoreCategory[];
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
    "Reads the full candidate product list and picks only the best matches for the shopper, ranked best-first.",
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
          },
          required: ["productId"],
        },
      },
    },
    required: ["selections"],
  },
};

function formatProductLine(p: Product): string {
  const tags = p.tags.length > 0 ? p.tags.join(", ") : "none";
  const description = p.description ? p.description.slice(0, 200) : "none";
  return `- id: ${p.id} | name: "${p.name}" | price: ${p.price} ${p.currency} | inStock: ${p.inStock} | rating: ${p.rating} (${p.reviewCount} reviews) | category: ${p.categoryId || "none"} | tags: ${tags} | description: ${description}`;
}

function buildSelectionPrompt(input: SelectProductsInput): string {
  const lines: string[] = [`Shopper's search query: "${input.query}"`];
  if (input.intake.useCase) lines.push(`Stated use case / need: ${input.intake.useCase}`);
  if (input.intake.priority) lines.push(`What matters most to them: ${input.intake.priority}`);
  if (input.intake.budget) lines.push(`Stated budget: ${input.intake.budget}`);
  lines.push(
    `Pick at most ${input.limit} products from the list below that best match the shopper's request, ordered best match first. Call select_products with your picks — never return more than ${input.limit}.`,
    "Candidate products:",
    ...input.pool.map(formatProductLine)
  );
  return lines.join("\n");
}

function requestTextFor(input: SelectProductsInput): string {
  return `${input.categoryId ?? ""} ${input.query}`;
}

function fallbackSelect(input: SelectProductsInput): Product[] {
  const ctx: RankingContext = {
    intake: input.intake,
    query: input.query,
    matchType: input.matchType,
  };
  const pool = filterToRequestedCategory(input.pool, requestTextFor(input), input.categories);
  return rankAndSelectTopK(pool, ctx, input.limit);
}

/**
 * One AI call that reads the whole candidate pool (up to CATALOG_SEARCH_POOL_SIZE) but only
 * ever writes out the handful of winning picks — output stays small regardless of pool size.
 * Falls back to the deterministic rank-products pipeline on any failure so a slow/broken AI
 * call never means the shopper sees nothing. Mirrors the wearable selectTopProducts, minus
 * garment-slot classification (which has no meaning for general merchandise).
 */
export async function selectTopProducts(input: SelectProductsInput): Promise<SelectProductsResult> {
  if (input.pool.length === 0) {
    return { products: [], usedFallback: false };
  }

  if (!input.apiKey) {
    return { products: fallbackSelect(input), usedFallback: true };
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
      // Input can be large (up to ~200 products), but output is bounded to `limit` entries.
      timeoutMs: 25_000,
    });

    const call = toolCalls.find((tc) => tc.function.name === "select_products");
    if (!call) return { products: fallbackSelect(input), usedFallback: true };

    const parsed = JSON.parse(call.function.arguments) as {
      selections?: Array<{ productId?: unknown }>;
    };
    const selections = Array.isArray(parsed.selections) ? parsed.selections : [];

    const byId = new Map(input.pool.map((p) => [p.id, p]));
    const seen = new Set<string>();
    const picked: Product[] = [];

    for (const entry of selections) {
      if (picked.length >= input.limit) break;
      if (typeof entry.productId !== "string") continue;
      if (seen.has(entry.productId)) continue;
      const product = byId.get(entry.productId);
      if (!product) continue;

      seen.add(entry.productId);
      picked.push(product);
    }

    if (picked.length === 0) {
      return { products: fallbackSelect(input), usedFallback: true };
    }

    // Safety net: even with the full candidate pool in front of it, the model can still
    // pick a plausible-sounding but wrong-category product — same fail-open filter as the
    // fallback path, applied after picks are resolved so it never runs against noise.
    const consistent = filterToRequestedCategory(picked, requestTextFor(input), input.categories);

    return { products: consistent.slice(0, input.limit), usedFallback: false };
  } catch (err) {
    console.error("[unwearable-chat-agent selectTopProducts]", err);
    return { products: fallbackSelect(input), usedFallback: true };
  }
}
