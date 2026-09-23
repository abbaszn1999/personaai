import { getPlatformGeminiClient, GeminiApiError } from "@/lib/ai/gemini";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import {
  getProvenGlobalBrands,
  listSizingCoverage,
  setBrandType,
  type BrandType,
} from "@/lib/db/sizing-coverage";
import { UNKNOWN_BRAND_KEY } from "./keys";

/**
 * Stage 3's complete decision:
 *
 * 1. Scan coverage contains the mapped brand field exactly as the store supplied it.
 * 2. Empty fields are marked `none` without involving a model.
 * 3. Every distinct non-empty brand in the selected, sized catalog is sent to Gemini together.
 * 4. The one response splits that list into `global_brands` and `private_brands`.
 *
 * There is no product-level brand inference and no per-brand request. Products already carry their
 * brand; Gemini only decides which of the two routing buckets each distinct name belongs to.
 */

const CLASSIFY_MODEL = process.env.SIZING_CLASSIFY_MODEL ?? "gemini-3.7-flash";

export interface BrandVerdict {
  brandType: Extract<BrandType, "global" | "private">;
}

export interface ClassificationResult {
  /** Distinct non-empty brands classified by the single request. */
  classified: number;
  global: number;
  private: number;
  /** 1 when this store has any Null / No brand stock; it is one sentinel in coverage. */
  none: number;
}

export async function runBrandClassification(connection: StoreConnectionRow): Promise<ClassificationResult> {
  const coverage = await listSizingCoverage(connection.id);
  const named = new Map<string, string>();
  let hasUnbranded = false;

  // Coverage has one row per brand x sizing category. Collapse that to one entry per brand before
  // the request, so Nike spanning five categories appears once in the input and one verdict updates
  // all five rows.
  for (const row of coverage) {
    if (row.brandKey === UNKNOWN_BRAND_KEY) {
      hasUnbranded = true;
      continue;
    }
    // A rescan preserves settled classifications. Only send genuinely unanswered brands back to
    // Gemini: reclassifying all established brands wastes a model call and, more importantly, turns
    // a retry after one failed database write into ninety writes instead of the one still owed.
    if (row.brandType !== "unclassified") continue;
    if (!named.has(row.brandKey)) named.set(row.brandKey, row.brandName ?? row.brandKey);
  }

  const result: ClassificationResult = {
    classified: 0,
    global: 0,
    private: 0,
    none: hasUnbranded ? 1 : 0,
  };

  // Null is a fact from the mapped catalog field, not a classification. It never goes into Gemini.
  if (hasUnbranded) {
    const saved = await setBrandType(connection.id, UNKNOWN_BRAND_KEY, "none", null);
    if (!saved) throw new Error("Could not save the no-brand classification.");
  }

  const canonicalNames = new Map(
    Object.values(connection.sizingBrandMapping?.aliases ?? {}).map((alias) => [
      alias.canonicalKey,
      alias.canonicalName,
    ]),
  );
  const proven = await getProvenGlobalBrands([...named.keys()]);
  for (const [brandKey, fallbackName] of proven) {
    const canonicalName = canonicalNames.get(brandKey) ?? fallbackName ?? named.get(brandKey) ?? brandKey;
    const saved = await setBrandType(connection.id, brandKey, "global", canonicalName);
    if (!saved) throw new Error(`Could not save the shared classification for ${canonicalName}.`);
    named.delete(brandKey);
    result.classified += 1;
    result.global += 1;
  }

  const entries = [...named.entries()];
  if (entries.length === 0) return result;

  const names = entries.map(([, name]) => name);
  const verdicts = await classifyCatalogBrands(names, storeContextFor(connection));
  const unanswered = verdicts.reduce<number[]>((missing, verdict, index) => {
    if (!verdict) missing.push(index);
    return missing;
  }, []);
  if (unanswered.length > 0) {
    // The contract says every input appears exactly once. Treat a partial answer as a failed single
    // request instead of publishing a half-classified Stage 2 and quietly routing the rest nowhere.
    throw new GeminiApiError(
      `Brand classification omitted or duplicated ${unanswered.length} of ${names.length} brand(s).`
    );
  }

  const failedWrites: string[] = [];
  for (const [index, [brandKey, brandName]] of entries.entries()) {
    const verdict = verdicts[index];
    // Proved by the complete-response check above.
    if (!verdict) continue;

    // Research needs a name for global brands; with the requested two-array response the exact
    // catalog string is that name. Private labels deliberately keep no canonical company name.
    const saved = await setBrandType(
      connection.id,
      brandKey,
      verdict.brandType,
      verdict.brandType === "global" ? brandName : null
    );
    if (!saved) {
      failedWrites.push(brandName);
      continue;
    }
    result.classified += 1;
    if (verdict.brandType === "global") result.global += 1;
    else result.private += 1;
  }

  // A model response is not a completed classification until every verdict is persisted. The old
  // code ignored setBrandType's boolean, advanced the run to research, and left the failed brands
  // permanently `unclassified`. Failing the run keeps Stage 2 blocked and makes the retry explicit.
  if (failedWrites.length > 0) {
    throw new Error(
      `Could not save classifications for ${failedWrites.length} brand(s): ${failedWrites.join(", ")}.`
    );
  }

  return result;
}

function storeContextFor(connection: StoreConnectionRow): string {
  let domain = connection.storeUrl;
  try {
    domain = new URL(connection.storeUrl).hostname;
  } catch {
    // A stored URL that will not parse is still useful context verbatim.
  }
  return `The catalog belongs to "${connection.storeName}" at ${domain}.`;
}

const CLASSIFY_INSTRUCTIONS = [
  "Classify the complete brand list from one fashion store catalog.",
  "",
  "Return exactly two arrays:",
  '- `global_brands`: independently established third-party brands, including niche, regional, luxury, and mass-market brands.',
  '- `private_brands`: the storefront\'s own label, a store-exclusive house label, or an unrecognisable local label.',
  "",
  "Rules:",
  "- Every input brand must appear exactly once across the two arrays.",
  "- Copy each input string exactly. Do not rename, normalize, expand or invent brands.",
  "- Judge the brand name, not individual products.",
  "- A name matching the storefront name or domain is a private brand.",
  "- Do not require worldwide scale or broad retailer distribution for global_brands.",
  "- Recognisable shortened or stylised names remain global; for example CLAUDIE (Claudie Pierlot) and ba&sh are global.",
  "- If a label is not recognisable as an independent established brand, classify it as private.",
  "- Return only the JSON object.",
].join("\n");

const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    global_brands: {
      type: "array",
      items: { type: "string" },
    },
    private_brands: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["global_brands", "private_brands"],
  additionalProperties: false,
} as const;

/**
 * The only LLM call in brand identification/classification.
 *
 * The request contains the complete distinct non-empty brand list for the selected, sized catalog.
 * Its response is the two arrays the product specifies; Null / No brand SKUs bypass this function.
 */
async function classifyCatalogBrands(
  names: string[],
  store: string
): Promise<Array<BrandVerdict | null>> {
  if (names.length === 0) return [];

  const ai = getPlatformGeminiClient();
  const prompt = [
    CLASSIFY_INSTRUCTIONS,
    "",
    `Storefront: ${store}`,
    "",
    `All catalog brands:\n${names.map((name) => `- ${name}`).join("\n")}`,
  ].join("\n");

  let text: string | undefined;
  try {
    const response = await ai.models.generateContent({
      model: CLASSIFY_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: CLASSIFY_SCHEMA,
        temperature: 0,
      },
    });
    text = response.text?.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Brand classification failed.";
    throw new GeminiApiError(message);
  }

  if (!text) return names.map(() => null);
  return parseClassification(text, names);
}

function comparable(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * Maps the two returned arrays back to input order.
 *
 * Name matching is case-insensitive only for resilience, while the stored value stays the exact
 * catalog string. A missing or duplicated-across-buckets name is null, never silently defaulted.
 */
export function parseClassification(text: string, names: readonly string[]): Array<BrandVerdict | null> {
  const verdicts: Array<BrandVerdict | null> = names.map(() => null);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("[sizing classify] response was not valid JSON");
    return verdicts;
  }

  const response = parsed as { global_brands?: unknown; private_brands?: unknown };
  if (!Array.isArray(response.global_brands) || !Array.isArray(response.private_brands)) {
    console.error("[sizing classify] response did not contain both brand arrays");
    return verdicts;
  }

  const global = response.global_brands
    .filter((value): value is string => typeof value === "string")
    .map(comparable);
  const privateLabels = response.private_brands
    .filter((value): value is string => typeof value === "string")
    .map(comparable);

  names.forEach((name, index) => {
    const key = comparable(name);
    const globalCount = global.filter((value) => value === key).length;
    const privateCount = privateLabels.filter((value) => value === key).length;
    if (globalCount + privateCount !== 1) return;
    verdicts[index] = {
      brandType: globalCount === 1 ? "global" : "private",
    };
  });

  return verdicts;
}
