import { ThinkingLevel } from "@google/genai";
import { getPlatformGeminiClient, GeminiApiError } from "@/lib/ai/gemini";

/**
 * Arranges a Shopify store's flat collections into the two-level hierarchy the Categories tab asks
 * merchants to build.
 *
 * Shopify has no category tree — a store is a bag of collections, mixing real departments
 * ("Women"), garment families ("Womens Knitwear"), and merchandising that is not a category at all
 * ("Summer Sale", "Back in Stock"). The merchant is asked to impose a shape on that, and this does
 * the first pass.
 *
 * Replaces a regex pass over the titles that only knew English audience and garment words, and had
 * no way to tell a promotion from a department beyond a list of promo words. Deciding that "Back in
 * Stock" is not a category, while "Après Ski" is, is a judgement about retail, not string matching.
 *
 * Returns an assignment per collection rather than a tree, deliberately. Ids, node identity and how
 * the result merges into what the merchant already arranged are the caller's business, and a model
 * that never sees them cannot corrupt them.
 */

const GROUP_MODEL = process.env.SIZING_PATH_MODEL ?? "gemini-3.7-flash";

/**
 * The model's own output ceiling, asked for explicitly rather than reduced from it.
 *
 * Not to be confused with the 1M context window, which is input. Output is capped at 64K for this
 * model whatever we pass, and clients that do not set this have been known to inherit a legacy 8K
 * default — which would truncate the response on a large store and drop the tail of the catalog.
 *
 * One entry is about 15 tokens (`{"department":"Women","sub_group":"Tops"}`), so this covers a few
 * thousand collections. Past that the response is what would have to be split, not the request.
 */
const MAX_OUTPUT_TOKENS = 65536;

export interface CollectionToGroup {
  id: string;
  name: string;
  productCount: number;
}

export interface CollectionPlacement {
  /** Top level, usually the audience — `Women`, `Men`, `Kids`. */
  department: string;
  /** Second level, usually the garment family — `Tops`, `Footwear`. */
  subGroup: string;
}

const INSTRUCTIONS = [
  "You are organising one Shopify store's collections into a two-level hierarchy a merchant will",
  "use to describe their catalog. Shopify has no category tree, so the collections arrive flat and",
  "unordered.",
  "",
  "For each collection give:",
  '- "department" — the top level. Prefer the audience: Women, Men, Kids, Unisex. Use a product',
  "  family only when the store clearly serves one audience and its collections never mention one.",
  '- "sub_group" — the garment family within that department: Tops, Bottoms, Dresses, Outerwear,',
  "  Footwear, Accessories. Use Other when the collection is clothing but fits none of them.",
  "",
  "Rules:",
  "- Reuse the same wording across collections. Two spellings of one department split it in two, so",
  '  every women\'s collection says exactly "Women".',
  '- Leave both fields empty for a collection that is not a category: promotions and merchandising',
  '  such as "Sale", "New In", "Best Sellers", "Back in Stock", "Gift Guide", "Staff Picks". These',
  "  cut across the catalog and belong in no single branch.",
  "- Judge the collection's own words, in whatever language they are written. Do not translate the",
  "  names in your answer — echo the store's own wording for a department that is itself a",
  "  collection.",
  "- Return exactly one entry per input collection, in the same order.",
].join("\n");

const SCHEMA = {
  type: "object",
  properties: {
    collections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          department: { type: "string" },
          sub_group: { type: "string" },
        },
        required: ["department", "sub_group"],
        additionalProperties: false,
      },
    },
  },
  required: ["collections"],
  additionalProperties: false,
} as const;

/**
 * Groups every collection in one call, returning a placement per id.
 *
 * One call, never chunked, however many collections there are. This has to see the whole store at
 * once to be correct: the department names are invented here, and the instruction to spell one
 * department the same way everywhere is unenforceable across separate stateless requests. Split into
 * batches, the model called the same department "Women" in one and "Womens" in the next, and the tree
 * builder keys departments by name — so one department became two siblings and every leaf under the
 * second was sized separately.
 *
 * Collection titles are short, so a few thousand of them is a small prompt for this model.
 *
 * Collections the model skipped are absent from the map. The caller leaves those in the bank for the
 * merchant to place by hand, which is the right home for a promotion and the safe outcome for a
 * malformed response.
 */
export async function groupCollections(
  collections: readonly CollectionToGroup[],
  storeContext: string
): Promise<Map<string, CollectionPlacement>> {
  const placements = new Map<string, CollectionPlacement>();
  if (collections.length === 0) return placements;

  const ai = getPlatformGeminiClient();
  const prompt = [
    INSTRUCTIONS,
    "",
    `Storefront: ${storeContext}`,
    "",
    "Collections:",
    collections
      .map((collection, i) => `${i + 1}. ${collection.name}  [${collection.productCount} products]`)
      .join("\n"),
  ].join("\n");

  let text: string | undefined;
  try {
    const response = await ai.models.generateContent({
      model: GROUP_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: SCHEMA,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // Gemini 3.7 rejects MINIMAL and owns its own sampling, so there is no `temperature` to pin.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    text = response.text?.trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Collection grouping failed.";
    throw new GeminiApiError(message);
  }

  if (!text) return placements;

  const answers = parseGrouping(text, collections.length);
  for (const [index, collection] of collections.entries()) {
    const answer = answers[index];
    if (answer) placements.set(collection.id, answer);
  }

  return placements;
}

/**
 * Reads the model's response into a fixed-length placement list.
 *
 * An entry missing either level is dropped rather than half-applied: a collection with a department
 * and no sub-group would land in a branch the merchant never asked for, which is harder to notice
 * and undo than one still sitting in the bank.
 */
export function parseGrouping(text: string, expected: number): Array<CollectionPlacement | null> {
  const placements: Array<CollectionPlacement | null> = Array(expected).fill(null);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("[group collections] response was not valid JSON");
    return placements;
  }

  const rows = (parsed as { collections?: unknown })?.collections;
  if (!Array.isArray(rows)) {
    console.error("[group collections] response had no collections array");
    return placements;
  }

  for (let i = 0; i < Math.min(expected, rows.length); i++) {
    const row = rows[i] as { department?: unknown; sub_group?: unknown } | null;
    const department = typeof row?.department === "string" ? row.department.trim() : "";
    const subGroup = typeof row?.sub_group === "string" ? row.sub_group.trim() : "";
    if (!department || !subGroup) continue;

    placements[i] = { department, subGroup };
  }

  return placements;
}
