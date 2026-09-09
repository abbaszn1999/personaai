import { ThinkingLevel } from "@google/genai";
import { getPlatformGeminiClient, GeminiApiError } from "@/lib/ai/gemini";
import {
  isSizingGroup,
  SIZING_GROUP_KEYS,
  SIZING_GROUP_LABELS,
  SIZING_GROUP_SCOPES,
  type SizingGroup,
} from "@/lib/sizing/measurements";

/**
 * Decides which of the five parent sizing categories a merchant's category path belongs to.
 *
 * Replaces a keyword matcher that read the garment noun out of the path text. That worked on a
 * taxonomy that names garments — `Women > Dresses > Shirt Dresses` — and was useless on the far
 * more common one that stops at the department: `Women > Clothing`, `Kids > Newborn Essentials`.
 * It was also English-only, so a Greek or German storefront got nothing at all.
 *
 * The fix is not a better word list. It is giving the decision something to look at: this classifier
 * sees a sample of the products actually in the path, so it answers from the stock rather than from
 * the name. That also lets it return the answer the keyword matcher could never express — `mixed`,
 * meaning the path genuinely holds several parents and no single mapping is right for it.
 *
 * Cost scales with paths, not products, and a store maps its categories once.
 */

/** Gemini 3.7 Flash rather than the 3.6 the rest of the app pins: this is a short, high-volume
 *  judgement per path where the accuracy gain is worth more than the latency, and 3.7 is GA. */
const CLASSIFY_MODEL = process.env.SIZING_PATH_MODEL ?? "gemini-3.7-flash";

/** Paths per model call. A typical store is one request; a large taxonomy splits without one bad
 *  response costing every other path's answer. */
const PATH_CHUNK = 40;

/** Sample titles shown per path. Enough to see that a path is mixed, few enough that forty paths
 *  still fit comfortably in one request. */
export const TITLE_SAMPLE = 12;

export interface PathToClassify {
  /** Opaque to this module — echoed back on the verdict so the caller can match rows. */
  id: string;
  /** `Women > Clothing`, root-first, as the merchant wrote it. */
  path: string;
  /** Titles of real products currently in the path. May be empty when the live fetch failed, in
   *  which case the model is told so rather than left to read the emptiness as "no stock". */
  sampleTitles: readonly string[];
  productCount: number;
}

export interface PathVerdict {
  /** Null when the model declined — either it could not tell, or the path is `mixed`. */
  parent: SizingGroup | null;
  /**
   * The path holds products from several parents, so no single mapping is correct for it.
   *
   * Worth a field of its own rather than collapsing into a null parent, because the two call for
   * opposite things from the merchant: an unsure verdict wants them to look and decide, while a
   * mixed one means deciding cannot help and the path needs splitting or per-product overrides.
   */
  mixed: boolean;
  /** One short sentence, shown on the row. The merchant is being asked to trust a guess about 1,800
   *  products they cannot see, so the guess says what it was based on. */
  reason: string;
}

const PARENT_LINES = SIZING_GROUP_KEYS.map(
  (group) => `- "${group}" (${SIZING_GROUP_LABELS[group]}) — ${SIZING_GROUP_SCOPES[group]}`
).join("\n");

const INSTRUCTIONS = [
  "You are mapping one online clothing store's own category paths onto five parent sizing",
  "categories. The mapping decides which body measurements a size chart for that path must carry,",
  "and every product in the path inherits the answer.",
  "",
  "The five parents:",
  PARENT_LINES,
  "",
  "For each path you are given its full breadcrumb, how many products it holds, and the titles of a",
  "sample of those products.",
  "",
  "Rules:",
  "- Judge on the sample titles first. The path name is a hint, not the answer — a path called",
  '  "Clothing" or "New In" says nothing, while its products say everything.',
  "- Ignore audience, season, occasion and promotion words. Men, women, kids, summer, sale and new",
  "  in do not change which measurements a garment needs.",
  '- Where the path name does name a garment, remember English compounds carry their head last:',
  '  "Dress Shirts" are shirts (tops), "Shirt Dresses" are dresses.',
  '- Answer "mixed" when the sample shows several parents genuinely sharing the path — a "Clothing"',
  "  path holding t-shirts, jeans and coats at once. Do not pick the most common one. A wrong single",
  "  answer silently sizes every other garment in the path against the wrong chart.",
  '- Answer "unknown" when the sample is empty, or is not clothing at all (bags, jewellery, beauty).',
  '- Do not guess. "mixed" and "unknown" are useful answers; a confident wrong one is not.',
  "- Give a reason of at most 15 words, naming what in the sample decided it.",
  "- Return exactly one entry per input path, in the same order.",
].join("\n");

const SCHEMA = {
  type: "object",
  properties: {
    paths: {
      type: "array",
      items: {
        type: "object",
        properties: {
          parent: {
            type: "string",
            enum: [...SIZING_GROUP_KEYS, "mixed", "unknown"],
          },
          reason: { type: "string" },
        },
        required: ["parent", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["paths"],
  additionalProperties: false,
} as const;

/** One path as the model sees it. Empty samples are stated outright — an absent list would read as
 *  an empty category, which is a different thing from a fetch that failed. */
function promptFor(path: PathToClassify, position: number): string {
  const titles =
    path.sampleTitles.length > 0
      ? path.sampleTitles.map((title) => `   - ${title}`).join("\n")
      : "   (no sample available)";

  return [`${position}. ${path.path}  [${path.productCount} products]`, titles].join("\n");
}

/**
 * Classifies a batch of paths, returning a verdict per id.
 *
 * Paths the model failed to cover are simply absent from the map rather than defaulted. Every
 * caller treats a missing verdict as "still needs the merchant", which is the honest outcome and
 * the same one the old heuristic produced when it declined.
 */
export async function classifyCategoryPaths(
  paths: readonly PathToClassify[],
  storeContext: string
): Promise<Map<string, PathVerdict>> {
  const verdicts = new Map<string, PathVerdict>();
  if (paths.length === 0) return verdicts;

  for (let i = 0; i < paths.length; i += PATH_CHUNK) {
    const chunk = paths.slice(i, i + PATH_CHUNK);
    const answers = await classifyChunk(chunk, storeContext);

    for (const [index, path] of chunk.entries()) {
      const answer = answers[index];
      if (answer) verdicts.set(path.id, answer);
    }
  }

  return verdicts;
}

async function classifyChunk(
  chunk: readonly PathToClassify[],
  storeContext: string
): Promise<Array<PathVerdict | null>> {
  const ai = getPlatformGeminiClient();
  const prompt = [
    INSTRUCTIONS,
    "",
    `Storefront: ${storeContext}`,
    "",
    "Paths:",
    chunk.map((path, i) => promptFor(path, i + 1)).join("\n"),
  ].join("\n");

  let text: string | undefined;
  try {
    const response = await ai.models.generateContent({
      model: CLASSIFY_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: SCHEMA,
        // Gemini 3.7 rejects MINIMAL and manages sampling itself, so there is no `temperature` here
        // — the knob the 3.6 classifiers use to keep their answers reproducible does not exist on
        // this model. LOW is the floor, and enough for a judgement this size.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    text = response.text?.trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Category classification failed.";
    throw new GeminiApiError(message);
  }

  if (!text) return chunk.map(() => null);

  return parsePathClassification(text, chunk.length);
}

/**
 * Reads the model's response into a fixed-length verdict list.
 *
 * Tolerant on purpose: a short, over-long or partly malformed response keeps the answers it did
 * parse and degrades the rest to null, rather than throwing away a batch of good work because one
 * entry came back wrong.
 */
export function parsePathClassification(text: string, expected: number): Array<PathVerdict | null> {
  const verdicts: Array<PathVerdict | null> = Array(expected).fill(null);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("[classify paths] response was not valid JSON");
    return verdicts;
  }

  const rows = (parsed as { paths?: unknown })?.paths;
  if (!Array.isArray(rows)) {
    console.error("[classify paths] response had no paths array");
    return verdicts;
  }

  for (let i = 0; i < Math.min(expected, rows.length); i++) {
    const row = rows[i] as { parent?: unknown; reason?: unknown } | null;
    const parent = row?.parent;
    const reason = typeof row?.reason === "string" ? row.reason.trim() : "";

    if (parent === "mixed") {
      verdicts[i] = { parent: null, mixed: true, reason };
      continue;
    }
    // "unknown", anything unrecognised, and a missing entry all collapse to the same thing: no
    // answer for this row. Only a real parent is ever written onto the merchant's map.
    if (isSizingGroup(parent)) {
      verdicts[i] = { parent, mixed: false, reason };
    }
  }

  return verdicts;
}
