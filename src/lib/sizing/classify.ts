import { getPlatformGeminiClient, GeminiApiError } from "@/lib/ai/gemini";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import {
  getGlobalBrandKeys,
  listSizingCoverage,
  setBrandType,
  type BrandType,
} from "@/lib/db/sizing-coverage";
import { UNKNOWN_BRAND_KEY } from "./keys";

/**
 * Decides, per distinct brand, whether a public size chart is worth going to look for.
 *
 * This is the step that decides where every later dollar goes. `global` brands route to a paid web
 * search that is paid for once per brand and reused across stores; `private` labels and unbranded
 * stock route to manual filling, which costs the merchant time and us nothing. Classifying a private
 * label as global buys a research request that can only come back empty; classifying a real brand as
 * private makes a merchant hand-type a chart that was freely available.
 *
 * Cost scales with distinct brand *strings*, not products and not coverage rows. A brand spanning 50
 * categories and 20,000 SKUs is one decision, applied deterministically to all of it.
 */

const CLASSIFY_MODEL = process.env.SIZING_CLASSIFY_MODEL ?? "gemini-3.6-flash";

/** Brands per model call. Large enough that a typical store is a single request, small enough that
 *  one malformed response never costs the whole catalog's classification. */
const CLASSIFY_CHUNK = 80;

export interface ClassificationResult {
  /** Distinct brands whose type was written this run. */
  classified: number;
  /** Brands that skipped the model because another store had already established they are global. */
  reused: number;
  global: number;
  private: number;
  /** 1 when this store has unbranded stock, since that collapses to a single sentinel brand. */
  none: number;
}

/**
 * Classifies every brand in a store's coverage that does not already have a type.
 *
 * Idempotent and resumable: rows already carrying a type are skipped, so a re-run after a failure
 * pays only for what is still `unclassified`, and `replaceSizingCoverage` deliberately carries types
 * across a re-scan for the same reason.
 */
export async function runBrandClassification(connection: StoreConnectionRow): Promise<ClassificationResult> {
  const coverage = await listSizingCoverage(connection.id);

  // Deduplicated to distinct brands: coverage is one row per brand *per category*, and the model is
  // asked once per brand.
  const pending = new Map<string, string>();
  let hasUnbranded = false;

  for (const row of coverage) {
    if (row.brandKey === UNKNOWN_BRAND_KEY) {
      hasUnbranded = true;
      continue;
    }
    if (row.brandType !== "unclassified") continue;
    if (!pending.has(row.brandKey)) pending.set(row.brandKey, row.brandName ?? row.brandKey);
  }

  const result: ClassificationResult = { classified: 0, reused: 0, global: 0, private: 0, none: 0 };

  // Unbranded stock is not a judgement call and never goes to a model — there is no name to reason
  // about. It is marked `none` rather than left `unclassified` because routing reads this column
  // directly, and the two are not the same thing: `none` means "manual fill, grouped by category",
  // while `unclassified` would fall through to the paid research queue.
  if (hasUnbranded) {
    await setBrandType(connection.id, UNKNOWN_BRAND_KEY, "none");
    result.none = 1;
  }

  if (pending.size === 0) return result;

  // Cross-store reuse, and only for `global`. That a brand is a real manufacturer with a public size
  // guide is objective and store-independent, so the second store selling Nike inherits the answer
  // for free. `private` is deliberately never reused: two merchants can carry unrelated house labels
  // under the same name, and inheriting that would hand one merchant's chart decision to another.
  const alreadyGlobal = await getGlobalBrandKeys([...pending.keys()]);
  for (const brandKey of alreadyGlobal) {
    if (!pending.has(brandKey)) continue;
    await setBrandType(connection.id, brandKey, "global");
    pending.delete(brandKey);
    result.reused += 1;
    result.global += 1;
    result.classified += 1;
  }

  const store = storeContextFor(connection);

  const entries = [...pending.entries()];
  for (let i = 0; i < entries.length; i += CLASSIFY_CHUNK) {
    const chunk = entries.slice(i, i + CLASSIFY_CHUNK);
    const verdicts = await classifyBrandNames(
      chunk.map(([, name]) => name),
      store
    );

    for (const [index, [brandKey]] of chunk.entries()) {
      const verdict = verdicts[index];
      // No verdict means the model returned nothing usable for this brand. Left `unclassified`
      // rather than defaulted: guessing `global` spends money on a search for a shop's own label,
      // and guessing `private` makes a merchant hand-fill a chart that exists publicly. An
      // unclassified row surfaces in the UI as needing a look, which is the honest outcome.
      if (!verdict) continue;

      await setBrandType(connection.id, brandKey, verdict);
      result.classified += 1;
      if (verdict === "global") result.global += 1;
      else if (verdict === "private") result.private += 1;
    }
  }

  return result;
}

/**
 * The storefront the brand names came from, as one line for the prompt.
 *
 * The rules below lean on a house label "often containing the shop's own name" — a signal the model
 * was never actually given, which is how a bare name like "Haus" comes back `unknown` and strands
 * its products in a queue nothing drains. The store's name and domain are the cheapest evidence
 * there is for that judgement, and both are already on the connection.
 */
function storeContextFor(connection: StoreConnectionRow): string {
  let domain = connection.storeUrl;
  try {
    domain = new URL(connection.storeUrl).hostname;
  } catch {
    // A stored URL that will not parse is still worth showing verbatim.
  }
  return `The catalog belongs to "${connection.storeName}" at ${domain}.`;
}

const CLASSIFY_INSTRUCTIONS = [
  "You are classifying brand names taken from one online clothing store's catalog.",
  "",
  'For each name, answer "global" or "private":',
  '- "global" — an established brand sold through many retailers, whose official size guide is published',
  "  on its own website. Nike, Zara, Levi's, Uniqlo, Carhartt, Fjällräven.",
  '- "private" — a house label, own-brand, or small store-specific line with no publicly published',
  "  size guide. Often contains the shop's own name, or reads like one shop's invention.",
  "",
  "Rules:",
  "- Judge the brand, not the product. You are not told what the store sells.",
  "- A brand being small or regional does not make it private. What matters is whether an official",
  "  size guide is published somewhere you could find it.",
  "- A name echoing the storefront named below — its shop name, its domain, or a word from either —",
  "  is a house label, even when the name alone would look like a real brand.",
  '- If you genuinely cannot tell, answer "unknown". Do not guess. A wrong "global" wastes a paid',
  '  search; a wrong "private" makes a shop owner hand-type a chart that already exists.',
  "- Return one entry per input name, in the same order, and nothing else.",
].join("\n");

const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    brands: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["global", "private", "unknown"] },
        },
        required: ["name", "type"],
        additionalProperties: false,
      },
    },
  },
  required: ["brands"],
  additionalProperties: false,
} as const;

/**
 * One model call for a batch of brand names.
 *
 * Returns a verdict per input position, with `null` wherever the model declined or the response did
 * not line up. Position rather than name matching, because the model echoing a name back slightly
 * altered ("Levis" for "Levi's") would otherwise silently drop that brand — while the *order* is
 * something the schema and instructions both pin down.
 */
async function classifyBrandNames(names: string[], store: string): Promise<Array<BrandType | null>> {
  if (names.length === 0) return [];

  const ai = getPlatformGeminiClient();
  const prompt = [
    CLASSIFY_INSTRUCTIONS,
    "",
    `Storefront: ${store}`,
    "",
    `Brand names:\n${names.map((name, i) => `${i + 1}. ${name}`).join("\n")}`,
  ].join("\n");

  let text: string | undefined;
  try {
    const response = await ai.models.generateContent({
      model: CLASSIFY_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: CLASSIFY_SCHEMA,
        // Classification should be reproducible: the same catalog reclassified should not drift
        // between global and private because of sampling.
        temperature: 0,
      },
    });
    text = response.text?.trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Brand classification failed.";
    throw new GeminiApiError(message);
  }

  if (!text) return names.map(() => null);

  return parseClassification(text, names.length);
}

/**
 * Reads the model's response into a fixed-length verdict list.
 *
 * Tolerant by design — a short, over-long or partly malformed response degrades the brands it failed
 * to cover to `null` (left unclassified, surfaced to the merchant) rather than throwing away the
 * batch's good answers.
 */
export function parseClassification(text: string, expected: number): Array<BrandType | null> {
  const verdicts: Array<BrandType | null> = Array(expected).fill(null);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("[sizing classify] response was not valid JSON");
    return verdicts;
  }

  const brands = (parsed as { brands?: unknown })?.brands;
  if (!Array.isArray(brands)) {
    console.error("[sizing classify] response had no brands array");
    return verdicts;
  }

  for (let i = 0; i < Math.min(expected, brands.length); i++) {
    const type = (brands[i] as { type?: unknown })?.type;
    if (type === "global" || type === "private") verdicts[i] = type;
  }

  return verdicts;
}
