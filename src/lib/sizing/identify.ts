import { getPlatformGeminiClient, GeminiApiError } from "@/lib/ai/gemini";

/**
 * Tab 2 of Documentation/persona_sizing.md — the brand identification agent.
 *
 * "Input: Full SKU dataset — every row, every column (title, description, category, existing brand
 * field if any). Task: Identify the brand per row."
 *
 * The word that matters is *identify*. Reading the platform's brand field is not this job; that
 * field is frequently empty, and on plenty of stores it holds the shop's own name on every product.
 * A catalog whose brands live in the title — "Nike Air Max 90", "Levi's 501 Straight" — is entirely
 * ordinary, and treating those as unbranded routes real brands with published, findable size guides
 * into a queue where the merchant hand-types the chart instead. That failure is silent: the pipeline
 * reports success and the work just quietly lands on a human.
 *
 * Cost is one call per batch of rows, not per row. It does scale with SKU count, which is the one
 * place the doc's own core rule ("never with SKU count") and its Tab 2 spec pull against each other
 * — the spec wins because the alternative is not identifying brands at all, and Flash over a title
 * and a truncated description is the cheapest model call in the pipeline by a wide margin.
 */

const IDENTIFY_MODEL = process.env.SIZING_IDENTIFY_MODEL ?? "gemini-3.6-flash";

/**
 * Hard ceiling on products per call — reached only by very large catalogs.
 *
 * The whole catalog goes in one request by design: the doc's Tab 2 is a single pass over the full
 * SKU dataset, and splitting it into arbitrary slices means the model judges "Nike" in isolation
 * several times over instead of seeing the catalog as one body of evidence.
 *
 * What forces a ceiling at all is the model's **output** limit, not its context window. Input is
 * cheap here — a product costs roughly 90 tokens, so even 10,000 of them sit comfortably inside a
 * 1M-token context. But the reply has to carry one entry per product, at ~15 tokens each, and a
 * response that runs past the output cap is truncated mid-array: the tail of the catalog silently
 * comes back unbranded. This is the largest run that still leaves headroom under that cap.
 *
 * Override with SIZING_IDENTIFY_MAX_ROWS when running against a model with a larger output budget.
 */
const MAX_ROWS_PER_CALL = Number(process.env.SIZING_IDENTIFY_MAX_ROWS) || 3_000;

/** Description characters sent per row. A brand that is going to be recoverable at all shows up in
 *  the opening clause; the rest is marketing copy that multiplies token cost across a whole catalog
 *  for no additional signal. */
const MAX_DESCRIPTION_CHARS = 240;

export interface IdentifyInput {
  externalId: string;
  title: string;
  description: string | null;
  /** The merchant's own category path, e.g. "Men > Tops". Context for disambiguating a name that
   *  could be a brand or a product word. */
  category: string | null;
  /** Whatever the platform's brand/vendor field holds, which may be empty, may be the real brand, or
   *  may be the shop's own name repeated on everything. */
  brandField: string | null;
}

const INSTRUCTIONS = [
  "You are identifying the manufacturer brand of each product in one online clothing store's catalog.",
  "",
  'For each product, return the brand name, or an empty string "" if there is genuinely no',
  "identifiable brand.",
  "",
  "Rules:",
  "- The supplied brand field is a strong signal but not automatically correct. If it holds a real",
  "  manufacturer name, return it as written there.",
  "- If the brand field is empty, read the title and description. Brands are very often the first",
  '  words of a title: "Nike Air Max 90" is Nike, "Levi\'s 501 Straight Jeans" is Levi\'s.',
  "- If the brand field holds the shop's own storefront name while the title names a real",
  "  manufacturer, prefer the manufacturer from the title.",
  "- Return the brand only — never the product line, model or collection. \"Nike Air Max\" is \"Nike\".",
  '- Return "" when no brand can be identified. Never invent one, and never fall back to a',
  "  descriptive word from the title. A wrong brand sends a size chart request for a company that",
  "  does not exist; an empty answer simply asks the shop owner to fill it in.",
  "- Spell a brand identically everywhere it appears, so the same brand groups together.",
  "- Return exactly one entry per input product, in the same order.",
].join("\n");

const IDENTIFY_SCHEMA = {
  type: "object",
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          // A plain string rather than a string/null union. Gemini's structured output does not
          // accept union types reliably, and a schema it rejects fails the whole scan — so "no
          // brand" is the empty string, which `parseIdentification` already reads as null.
          brand: { type: "string" },
        },
        required: ["index", "brand"],
        additionalProperties: false,
      },
    },
  },
  required: ["products"],
  additionalProperties: false,
} as const;

function describe(item: IdentifyInput, position: number): string {
  const lines = [`${position}. Title: ${item.title}`];
  if (item.brandField?.trim()) lines.push(`   Brand field: ${item.brandField.trim()}`);
  if (item.category?.trim()) lines.push(`   Category: ${item.category.trim()}`);

  const description = item.description?.replace(/\s+/g, " ").trim();
  if (description) lines.push(`   Description: ${description.slice(0, MAX_DESCRIPTION_CHARS)}`);

  return lines.join("\n");
}

/**
 * Identifies the brand for every product in the catalog.
 *
 * One request for the whole dataset. Splits only when the catalog is larger than a single response
 * can physically carry, and then into the fewest possible parts rather than a fixed batch size —
 * the split is a limit being worked around, not a design choice, so it should happen as rarely as
 * the model allows.
 */
export async function identifyBrands(
  items: IdentifyInput[],
  /** Called after each request on the split path, so a caller tracking a long-running job can show
   *  that it is still alive. A catalog large enough to split takes long enough that silence would
   *  otherwise be indistinguishable from a dead worker. */
  onProgress?: (done: number, total: number) => Promise<void>
): Promise<Array<string | null>> {
  if (items.length === 0) return [];
  if (items.length <= MAX_ROWS_PER_CALL) return identifyChunk(items);

  const parts = Math.ceil(items.length / MAX_ROWS_PER_CALL);
  const size = Math.ceil(items.length / parts);
  console.warn(
    `[sizing identify] ${items.length} products exceeds the ${MAX_ROWS_PER_CALL}-row response ceiling; ` +
      `splitting into ${parts} calls of ~${size}`
  );

  const brands: Array<string | null> = [];
  // Sequential rather than parallel: this path only runs for very large catalogs, and firing a
  // dozen requests of this size at once is what turns a slow scan into a rate-limited one.
  for (let i = 0; i < items.length; i += size) {
    brands.push(...(await identifyChunk(items.slice(i, i + size))));
    await onProgress?.(Math.min(i + size, items.length), items.length);
  }
  return brands;
}

/**
 * One identification request.
 *
 * Retried once, because a single transient blip should not discard a walk over the entire catalog —
 * but never silently degraded to the raw brand field, since a call that quietly fell back would
 * misroute exactly the products it exists to rescue, and nothing downstream could tell.
 */
async function identifyChunk(items: IdentifyInput[]): Promise<Array<string | null>> {
  const ai = getPlatformGeminiClient();
  const prompt = `${INSTRUCTIONS}\n\nProducts:\n${items.map((item, i) => describe(item, i + 1)).join("\n")}`;

  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model: IDENTIFY_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: IDENTIFY_SCHEMA,
          // The same catalog rescanned must produce the same brand keys, or coverage rows fork and
          // charts already paid for are researched again under a near-identical name.
          temperature: 0,
        },
      });

      const text = response.text?.trim();
      if (text) return parseIdentification(text, items.length);

      lastError = new GeminiApiError("Brand identification returned an empty response.");
    } catch (err) {
      lastError = err;
    }
  }

  const message = lastError instanceof Error ? lastError.message : "Brand identification failed.";
  throw new GeminiApiError(message);
}

/**
 * Reads the model's response into a fixed-length list of brand names.
 *
 * Matched on the returned `index` rather than array order. Unlike the classifier — where the input
 * is a bare name and a reordered response is detectable — a product list reordered by one position
 * would attach every brand to its neighbour, producing a catalog that looks fully identified and is
 * uniformly wrong. An explicit index makes that failure impossible rather than unlikely.
 *
 * Anything missing or unusable stays null, which routes that product to manual fill: the honest
 * outcome for "the model did not tell us".
 */
export function parseIdentification(text: string, expected: number): Array<string | null> {
  const brands: Array<string | null> = Array(expected).fill(null);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("[sizing identify] response was not valid JSON");
    return brands;
  }

  const products = (parsed as { products?: unknown })?.products;
  if (!Array.isArray(products)) {
    console.error("[sizing identify] response had no products array");
    return brands;
  }

  for (const entry of products) {
    const index = (entry as { index?: unknown })?.index;
    const brand = (entry as { brand?: unknown })?.brand;

    if (typeof index !== "number" || !Number.isInteger(index)) continue;
    // Prompt positions are 1-based; anything outside the batch is a hallucinated row.
    const slot = index - 1;
    if (slot < 0 || slot >= expected) continue;

    if (typeof brand !== "string") continue;
    const trimmed = brand.trim();
    // Models occasionally spell a JSON null as a string. Treated as no brand rather than as a brand
    // literally called "null", which would otherwise become a coverage row and a chart request.
    if (!trimmed || /^(null|none|n\/a|unknown|unbranded)$/i.test(trimmed)) continue;

    brands[slot] = trimmed;
  }

  return brands;
}
