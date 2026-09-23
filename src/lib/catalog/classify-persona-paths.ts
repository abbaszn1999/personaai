import { getPlatformGeminiClient, GeminiApiError } from "@/lib/ai/gemini";
import {
  PERSONA_CATEGORIES,
  PERSONA_DEPARTMENTS,
  PERSONA_SUB_CATEGORIES,
  type PersonaCategoryMapping,
  type SerializedTaxonomyScope,
} from "@/modules/store/mapping/persona-taxonomy";

export interface PersonaPathCandidate {
  id: string;
  path: string;
  productCount: number;
  sampleTitles: string[];
  /**
   * Position in the merchant's own category tree. A breadcrumb alone cannot express these, and
   * without them the model has to infer "is this a container or a real product bucket?" from the
   * category's name — which works for a category called "Women" and fails for one called
   * "Shoes & Bags" that sits at the same level and holds the whole catalog's accessories.
   */
  depth?: number;
  childCount?: number;
  childNames?: string[];
}

export interface PersonaMatchTarget {
  key: string;
  departmentId: string;
  categoryId: string;
  subCategory?: string;
  label: string;
}

export interface PersonaAutoMatchVerdict {
  id: string;
  mapping: PersonaCategoryMapping | null;
  reason: string;
  confidence: number;
}

const MODEL = process.env.PERSONA_MAPPING_MODEL ?? process.env.SIZING_CLASSIFY_MODEL ?? "gemini-3.7-flash";

/**
 * A category this large dominates whatever it is mapped to, so its verdict is held to the band the
 * prompt reserves for "titles unambiguously match the target's garment type, gender, and age
 * group". Small categories keep the looser bar — a wrong 8-SKU call is cheap to spot and fix.
 */
const LARGE_CATEGORY_SKUS = 300;
const LARGE_CATEGORY_MIN_CONFIDENCE = 0.9;

function targetsForScope(scope: SerializedTaxonomyScope): PersonaMatchTarget[] {
  const targets: PersonaMatchTarget[] = [];
  for (const department of PERSONA_DEPARTMENTS) {
    if (!scope.enabledDeptIds.includes(department.id)) continue;
    for (const category of PERSONA_CATEGORIES) {
      const enabledSubCategories = PERSONA_SUB_CATEGORIES[department.id][category.id]
        .filter((subCategory) => scope.enabledLeafKeys.includes(`${department.id}:${category.id}:${subCategory}`));

      if (enabledSubCategories.length === 0) continue;

      for (const subCategory of enabledSubCategories) {
        const key = `${department.id}:${category.id}:${subCategory}`;
        targets.push({
          key,
          departmentId: department.id,
          categoryId: category.id,
          subCategory,
          label: key.replaceAll(":", " > "),
        });
      }
    }
    for (const leaf of scope.customLeaves.filter((item) => item.deptId === department.id)) {
      const key = `${leaf.deptId}:${leaf.catId}:${leaf.subCategory}`;
      if (!scope.enabledLeafKeys.includes(key)) continue;
      targets.push({
        key,
        departmentId: leaf.deptId,
        categoryId: leaf.catId,
        subCategory: leaf.subCategory,
        label: `${leaf.deptId} > ${leaf.catId} > ${leaf.label}`,
      });
    }
  }
  return targets;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          action: { type: "string", enum: ["mapped", "excluded", "unmapped"] },
          target_key: { type: "string" },
          reason: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["id", "action", "target_key", "reason", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
} as const;

/**
 * Built once per call, not per candidate: a fixed decision procedure + worked examples keeps the
 * model's judgment consistent across every row in the batch, rather than drifting as the prompt
 * that also carries hundreds of store categories grows. Kept out of the per-request `prompt`
 * builder below so the taxonomy-independent parts of the instructions never have to be re-derived.
 */
const CLASSIFICATION_RULES = [
  "You are a precise fashion-catalog taxonomist. You classify a merchant's raw store categories",
  "into Persona's fixed taxonomy of department > category > sub-category paths. Correctness matters",
  "more than coverage: an incorrect `mapped` verdict corrupts the merchant's catalog, while an",
  "honest `unmapped` or `excluded` verdict is always safe and can be fixed by a human later.",
  "",
  "Each store category is given with its position in the merchant's own tree: `depth` (0 = a",
  "top-level category sitting beside the store's departments), `children` (its direct",
  "sub-categories, named when it has any), and `products` (a count that INCLUDES everything in its",
  "descendants, so a container's count is always larger than its own direct contents).",
  "",
  "DECISION PROCEDURE — apply in this exact order for every store category:",
  "0. If `children` is not 0, this is a container category. Its products belong to its",
  "   sub-categories, which you are classifying separately, so mapping it would double-map them.",
  "   -> action=\"unmapped\", unless every named child is unmistakably the same garment type, gender",
  "   and age group (e.g. children are \"Maxi Dresses\", \"Midi Dresses\", \"Gowns\").",
  "1. Read the category's breadcrumb path AND its sample product titles together. The breadcrumb",
  "   alone is often generic (\"Sale\", \"New In\", \"Featured\") — the titles are the real evidence.",
  "   At depth=0 the name carries no inherited gender or age group: a top-level category is a",
  "   store-wide bucket that usually spans every department, so NEVER infer gender or age group",
  "   from the store's tree at that depth — only the sample titles can establish them, and a single",
  "   dominant gender among the samples is not enough when the category holds hundreds of products.",
  "2. If the titles show non-apparel merchandise that Persona's taxonomy has no department/category",
  "   for at all (e.g. furniture, electronics, gift cards, home decor, food, services, jewelry-only",
  "   or bag-only lines when no accessories target exists in the allowed list) -> action=\"excluded\".",
  "3. If the titles clearly describe garments but no single allowed target key fits without",
  "   contradicting the evidence (e.g. the category mixes tops AND bottoms roughly evenly, or the",
  "   department implied by the titles — e.g. clearly menswear — is not in the allowed list at all",
  "   because that department is disabled) -> action=\"unmapped\". Never force a mismatched gender,",
  "   age group, or garment type onto a category just to produce a `mapped` verdict.",
  "3b. Treat these as proof of a mixed bucket that must be \"unmapped\", even when one type is the",
  "   clear majority of the samples — mapping it would silently misfile the rest:",
  "   - sizable garments mixed with unsizable accessories (a name like \"Shoes & Bags\", or samples",
  "     naming both shoes and handbags/wallets/briefcases). Nothing in the taxonomy sizes a bag.",
  "   - adult items mixed with items whose titles say \"Baby\", \"Newborn\", \"Toddler\", \"Kids\",",
  "     \"Boys\" or \"Girls\". Age group decides which size chart a product gets, so a bucket that",
  "     spans both cannot resolve to one target.",
  "   - a name joining two merchandise types with \"&\" or \"/\" where the taxonomy has a target for",
  "     only one of them.",
  "4. If there are zero or near-zero sample titles and the breadcrumb itself is not self-explanatory",
  "   (e.g. \"Sale\", \"Clearance\", \"Collection 24\") -> action=\"unmapped\". Do not guess from a",
  "   generic name alone.",
  "5. Otherwise, pick the SINGLE allowed target key whose department + category + sub-category",
  "   best matches the garment type",
  "   shown across the sample titles. Copy that key from the allowed list character-for-character —",
  "   never invent, abbreviate, or partially match a key.",
  "6. Every mapped result MUST be a complete leaf with all three segments. Department-level and",
  "   category-level targets are forbidden. If one leaf cannot honestly govern every product in",
  "   the store category, return action=\"unmapped\" so the merchant can split or resolve it.",
  "",
  "CONFIDENCE — reflects how certain the evidence makes the chosen action, on a 0.0-1.0 scale:",
  "- 0.9-1.0: titles unambiguously match the target's garment type, gender, and age group.",
  "- 0.6-0.89: titles mostly match but include a few off-type items or generic names.",
  "- Below 0.6: only used for `unmapped`/`excluded` calls made on weak or generic evidence.",
  "Never report high confidence for a `mapped` verdict built on fewer than 2 usable sample titles",
  "unless the breadcrumb path alone is unambiguous (e.g. \"Women / Dresses / Maxi Dresses\").",
  "",
  "REASON — one short factual sentence citing the specific evidence used (titles or breadcrumb",
  "terms), not a restatement of the taxonomy label. Example: \"Titles are all cotton crew tees.\"",
  "",
  "OUTPUT CONTRACT:",
  "- Return exactly one verdict object per input id, and never an id that was not given to you.",
  "- `target_key` is required and must be a verbatim allowed key when action=\"mapped\"; leave it",
  "  as an empty string for `excluded` and `unmapped`.",
  "- Do not add commentary, markdown, or any field beyond the schema.",
  "",
  "WORKED EXAMPLES (illustrative only — use the real allowed keys and ids supplied below):",
  "- id=cat_1; path=Women / Tops / Tees; depth=2; children=0; samples=\"Boxy cotton crew tee\" |",
  "  \"Ribbed tank top\"",
  "  -> action=mapped, target_key=women:top:t-shirt, confidence=0.95,",
  "     reason=\"Titles are cotton tees and a tank, both crew-neck tops.\"",
  "- id=cat_5; path=Women; depth=0; children=3 (Clothing, Accessories, Lingerie)",
  "  -> action=unmapped, target_key=\"\", confidence=0.95,",
  "     reason=\"Container category whose three children are classified separately.\"",
  "- id=cat_6; path=Shoes & Bags; depth=0; children=0; products=2045; samples=\"Leather stiletto",
  "  pump\" | \"Pebbled leather briefcase\" | \"Baby girl jelly sandals\" | \"Suede penny loafers\"",
  "  -> action=unmapped, target_key=\"\", confidence=0.9,",
  "     reason=\"Top-level bucket mixing women's shoes, unsizable bags, and baby footwear.\"",
  "- id=cat_2; path=Home / Furniture; samples=\"Oak dining chair\" | \"Velvet sofa\"",
  "  -> action=excluded, target_key=\"\", confidence=1.0, reason=\"Furniture, not apparel.\"",
  "- id=cat_3; path=Sale; samples=\"Men's slim jean\" | \"Women's midi skirt\" | \"Kids hoodie\"",
  "  -> action=unmapped, target_key=\"\", confidence=0.1,",
  "     reason=\"Mixed genders and garment types under one clearance bucket.\"",
  "- id=cat_4; path=New Arrivals; samples=(none)",
  "  -> action=unmapped, target_key=\"\", confidence=0.05,",
  "     reason=\"No product samples and the name gives no garment signal.\"",
].join("\n");

export async function classifyPersonaPaths(
  candidates: readonly PersonaPathCandidate[],
  scope: SerializedTaxonomyScope,
  storeContext: string,
): Promise<PersonaAutoMatchVerdict[]> {
  const targets = targetsForScope(scope);
  if (candidates.length === 0 || targets.length === 0) return [];

  const prompt = [
    CLASSIFICATION_RULES,
    "",
    "==== TASK FOR THIS REQUEST ====",
    `Merchant store: ${storeContext}`,
    "",
    `Allowed Persona targets (the ONLY valid target_key values, ${targets.length} total):`,
    ...targets.map((target) => `- ${target.key} (${target.label})`),
    "",
    `Store categories to classify (return exactly ${candidates.length} verdicts, one per id):`,
    ...candidates.map((candidate) =>
      [
        `- id=${candidate.id}; path=${candidate.path}; products=${candidate.productCount}`
        + `; depth=${candidate.depth ?? 0}${(candidate.depth ?? 0) === 0 ? " (top-level)" : ""}`
        + `; children=${candidate.childCount ?? 0}`
        + (candidate.childNames?.length ? ` (${candidate.childNames.join(", ")})` : ""),
        `  samples=${candidate.sampleTitles.length > 0 ? candidate.sampleTitles.join(" | ") : "(none)"}`,
      ].join("\n")
    ),
  ].join("\n");

  // Sized to the batch, not a flat constant: a single-call classification of a large category
  // list produces a proportionally large JSON array, and a fixed budget sized for a small store
  // would silently truncate the response for a large one. ~110 output tokens/verdict covers the
  // schema's five fields plus a full sentence of reasoning with headroom; clamped so a tiny
  // request doesn't request an oversized budget and a huge one still fits the model's ceiling.
  const maxOutputTokens = Math.min(32768, Math.max(2048, candidates.length * 110));

  let text: string | undefined;
  try {
    const response = await getPlatformGeminiClient().models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_SCHEMA,
        temperature: 0,
        maxOutputTokens,
        // Classification over a fixed schema needs no exploratory reasoning budget; disabling
        // it keeps the entire output budget available for the actual verdict array instead of
        // competing with hidden "thinking" tokens on a large single-call batch.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    text = response.text?.trim();
  } catch (error) {
    throw new GeminiApiError(error instanceof Error ? error.message : "Persona category matching failed.");
  }

  return parsePersonaAutoMatch(text ?? "", candidates, targets);
}

export function parsePersonaAutoMatch(
  text: string,
  candidates: readonly PersonaPathCandidate[],
  targets: readonly PersonaMatchTarget[],
): PersonaAutoMatchVerdict[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiApiError("Persona category matching returned invalid JSON.");
  }

  const rows = (parsed as { verdicts?: unknown })?.verdicts;
  if (!Array.isArray(rows)) throw new GeminiApiError("Persona category matching omitted verdicts.");

  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const targetsByKey = new Map(targets.map((target) => [target.key, target]));
  const seen = new Set<string>();
  const verdicts: PersonaAutoMatchVerdict[] = [];

  for (const rowValue of rows) {
    if (!rowValue || typeof rowValue !== "object") continue;
    const row = rowValue as Record<string, unknown>;
    if (typeof row.id !== "string" || seen.has(row.id)) continue;
    const candidate = candidatesById.get(row.id);
    if (!candidate) continue;
    seen.add(row.id);
    const reason = typeof row.reason === "string" ? row.reason.slice(0, 240) : "";
    const confidence = typeof row.confidence === "number" ? Math.max(0, Math.min(1, row.confidence)) : 0;

    if (row.action === "excluded") {
      verdicts.push({
        id: row.id,
        mapping: { status: "excluded", excludeReason: reason || "AI identified a non-fashion category", isAutoMatched: true },
        reason,
        confidence,
      });
      continue;
    }

    const target = typeof row.target_key === "string" ? targetsByKey.get(row.target_key) : undefined;
    if (row.action === "mapped" && target?.subCategory) {
      // A wrong mapping on a large category is the most expensive mistake this endpoint can make:
      // it is written silently, it dominates the scan, and it survives into paid chart research.
      // Below the floor the verdict is kept as a suggestion-shaped "unmapped" so it surfaces in the
      // merchant's review queue rather than in their catalog.
      if (candidate.productCount >= LARGE_CATEGORY_SKUS && confidence < LARGE_CATEGORY_MIN_CONFIDENCE) {
        verdicts.push({
          id: row.id,
          mapping: null,
          reason: `Needs review — ${target.key} at ${confidence.toFixed(2)} confidence is too uncertain for ${candidate.productCount} products. ${reason}`.slice(0, 240),
          confidence,
        });
        continue;
      }

      verdicts.push({
        id: row.id,
        mapping: {
          status: "mapped",
          departmentId: target.departmentId as PersonaCategoryMapping["departmentId"],
          categoryId: target.categoryId,
          subCategory: target.subCategory,
          isAutoMatched: true,
        },
        reason,
        confidence,
      });
      continue;
    }

    // Refusing an unrecognised key is right, but recording it as a plain "unmapped" made it
    // indistinguishable from a genuine no-decision — a leaf missing from the taxonomy looked
    // identical to a category the model declined, with nothing in the logs or the UI to tell them
    // apart.
    if (row.action === "mapped") {
      const attempted = typeof row.target_key === "string" ? row.target_key : "(non-string)";
      console.warn(`[persona auto-match] rejected out-of-scope target_key "${attempted}" for category ${row.id}`);
      verdicts.push({
        id: row.id,
        mapping: null,
        reason: `Suggested "${attempted}", which is not an enabled Persona path. ${reason}`.slice(0, 240),
        confidence,
      });
      continue;
    }

    verdicts.push({ id: row.id, mapping: null, reason, confidence });
  }

  for (const candidate of candidates) {
    if (!seen.has(candidate.id)) {
      verdicts.push({ id: candidate.id, mapping: null, reason: "AI returned no valid decision", confidence: 0 });
    }
  }
  return verdicts;
}
