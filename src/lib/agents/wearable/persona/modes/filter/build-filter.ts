import { createChatCompletion } from "@/lib/ai/gemini-chat";
import { addTokenCost, type SessionMeter } from "@/lib/billing/session-meter";
import { describeTaxonomy, findCategoryForSubcategory, isCanonicalCategory } from "@/lib/retrieval/taxonomy";
import type { CatalogFacets, CatalogFilter, ConversationTurn, HardRule } from "@/lib/retrieval/types";
import { loadSkill } from "../../../load-skill";
import { buildFilterTool } from "./tool";

export interface FilterValidationResult {
  filter: CatalogFilter;
  /** Every correction made, so the caller can log what the model got wrong rather than
   *  silently absorbing it. */
  corrections: string[];
}

/**
 * Repairs a model-generated filter against the real schema before it is ever executed.
 *
 * There is no fixed category vocabulary to check against — a value is valid exactly when it's
 * one the merchant's own catalog actually carries, per `facets`. A filter naming a column or
 * value that doesn't exist doesn't error — it returns nothing, which reads to a shopper as
 * "this store has none of those" rather than as a bug. That is the failure this function exists
 * to prevent: every unknown value is dropped and the query widens, rather than being passed
 * through to match zero rows.
 */
export function validateFilter(raw: Record<string, unknown>, facets: CatalogFacets): FilterValidationResult {
  const filter: CatalogFilter = {};
  const corrections: string[] = [];

  const category = typeof raw.category === "string" ? raw.category.trim() : undefined;
  const subcategory = typeof raw.subcategory === "string" ? raw.subcategory.trim() : undefined;

  if (subcategory) {
    // Prefer the pairing that also matches the stated category, but fall back to any stocked
    // entry with that subcategory name — the model can get the parent wrong even when the
    // subcategory itself is real.
    const match =
      facets.categories.find(
        (entry) =>
          entry.subcategory?.toLowerCase() === subcategory.toLowerCase() &&
          (!category || entry.category.toLowerCase() === category.toLowerCase())
      ) ?? facets.categories.find((entry) => entry.subcategory?.toLowerCase() === subcategory.toLowerCase());

    if (!match) {
      corrections.push(`No "${subcategory}" in this catalog — dropped.`);
    } else {
      if (category && match.category.toLowerCase() !== category.toLowerCase()) {
        corrections.push(`"${match.subcategory}" belongs to "${match.category}", not "${category}".`);
      }
      filter.category = match.category;
      filter.subcategory = match.subcategory ?? undefined;
    }
  }

  if (!filter.category && category) {
    const match = facets.categories.find((entry) => entry.category.toLowerCase() === category.toLowerCase());
    if (match) {
      filter.category = match.category;
    } else {
      corrections.push(`Dropped unknown category "${category}".`);
    }
  }

  applyGarmentFields(raw, filter, corrections);

  if (typeof raw.brand === "string" && raw.brand.trim()) {
    const wanted = raw.brand.trim();
    const match = facets.brands.find((brand) => brand.toLowerCase() === wanted.toLowerCase());
    if (match) {
      filter.brand = match;
    } else {
      corrections.push(`Dropped unknown brand "${wanted}".`);
    }
  }

  const priceMin = toPositiveNumber(raw.priceMin);
  const priceMax = toPositiveNumber(raw.priceMax);

  if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) {
    corrections.push("Swapped an inverted price range.");
    filter.priceMin = priceMax;
    filter.priceMax = priceMin;
  } else if (priceMin !== undefined && priceMin === priceMax) {
    // A floor and ceiling on the same number matches one exact price, which no shopper means and
    // every misread of "minimum $200" produces. The floor is the half worth believing: it is what
    // phrasings like "at least", "minimum" and "nothing under" actually state.
    corrections.push(`Read ${priceMin} as a floor, not an exact price.`);
    filter.priceMin = priceMin;
  } else {
    if (priceMin !== undefined) filter.priceMin = priceMin;
    if (priceMax !== undefined) filter.priceMax = priceMax;
  }

  // A ceiling below everything in the catalog matches nothing. Dropping it and letting the
  // ranking surface the cheapest options beats an empty result the shopper can't act on.
  if (filter.priceMax !== undefined && facets.priceRange && filter.priceMax < facets.priceRange.min) {
    corrections.push(`Nothing in this catalog is under ${filter.priceMax} — dropped the price ceiling.`);
    delete filter.priceMax;
  }

  if (raw.inStockOnly === true) filter.inStockOnly = true;

  return { filter, corrections };
}

function toPositiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Validates the garment fields against the canonical taxonomy rather than against `facets`.
 *
 * These are the fixed tops/bottoms/outerwear vocabulary every merchant's products are mapped onto
 * at index time, not the merchant's own aisle names, so the catalog's stocked values say nothing
 * about whether a value is legal. A merchant tree of "Men / Clothing" — which is most of them —
 * offers nothing to match "jacket" against, and before these fields existed a request that named
 * a garment produced no filter at all and leaned entirely on the ranker to keep coats and blazers
 * out of a result set asked for in jackets.
 */
function applyGarmentFields(raw: Record<string, unknown>, filter: CatalogFilter, corrections: string[]): void {
  const category = typeof raw.garmentCategory === "string" ? raw.garmentCategory.trim().toLowerCase() : undefined;
  const subcategory =
    typeof raw.garmentSubcategory === "string" ? raw.garmentSubcategory.trim().toLowerCase() : undefined;

  if (subcategory) {
    const parent = findCategoryForSubcategory(subcategory);
    if (!parent) {
      corrections.push(`Dropped unknown garment type "${subcategory}".`);
    } else {
      // The parent is derivable from the subcategory, so a model that names the wrong one is
      // corrected rather than believed — an inconsistent pair filters to nothing.
      if (category && category !== parent) {
        corrections.push(`"${subcategory}" is ${parent}, not ${category}.`);
      }
      filter.garmentCategory = parent;
      filter.garmentSubcategory = subcategory;
      return;
    }
  }

  if (category) {
    if (isCanonicalCategory(category)) filter.garmentCategory = category;
    else corrections.push(`Dropped unknown garment category "${category}".`);
  }
}

/**
 * Folds the merchant's absolute constraints into the query itself.
 *
 * Applied here rather than filtered out of the results afterwards, so excluded items are
 * never in the candidate set to begin with — nothing downstream, including the bundle model,
 * ever sees them and so nothing can put them back.
 */
export function applyHardRules(filter: CatalogFilter, rules: HardRule[]): CatalogFilter {
  const result: CatalogFilter = { ...filter };
  const excluded = new Set(result.excludeExternalIds ?? []);

  for (const rule of rules) {
    if (rule.type !== "exclude_items") continue;

    for (const id of rule.externalIds ?? []) excluded.add(id);

    // A category-level or brand-level exclusion that collides with what the shopper asked for
    // wins — "never surface this line" is not negotiable against a shopper's preference.
    if (rule.categories?.some((category) => category === result.category)) {
      delete result.category;
      delete result.subcategory;
    }
    if (rule.brands?.some((brand) => brand.toLowerCase() === result.brand?.toLowerCase())) {
      delete result.brand;
    }
  }

  if (excluded.size > 0) result.excludeExternalIds = [...excluded];
  return result;
}

export interface BuildFilterInput {
  query: string;
  recentTurns: ConversationTurn[];
  facets: CatalogFacets;
  apiKey: string;
  /** Carried in when the shopper is refining an existing selection. */
  anchorCategory?: string | null;
  budgetMax?: number;
  budgetMin?: number;
  meter?: SessionMeter;
}

/**
 * Folds a price bound stated to the agent — through the tool call, or through intake — into the
 * filter the model built.
 *
 * The two bounds are applied together and not independently, because the bug this exists to
 * prevent is a ceiling and a floor that are individually plausible and jointly empty. "A jacket,
 * minimum $200" set the floor from the message and the ceiling from the same $200 read as a
 * budget, which filtered to items priced at exactly $200 — nothing — and then apologised for
 * the shopper's budget being too low.
 *
 * Exported so it can be tested without standing up the model call that produces its input.
 */
export function applyStatedBounds(result: FilterValidationResult, input: BuildFilterInput): void {
  const { filter } = result;

  if (input.budgetMin && (filter.priceMin === undefined || filter.priceMin < input.budgetMin)) {
    filter.priceMin = input.budgetMin;
  }

  if (!input.budgetMax) return;
  if (filter.priceMin !== undefined && input.budgetMax <= filter.priceMin) {
    result.corrections.push(
      `Ignored a ${input.budgetMax} ceiling that leaves no room above the stated ${filter.priceMin} floor.`
    );
    return;
  }
  // Only tightens — never loosens a ceiling the model set deliberately.
  if (filter.priceMax === undefined || filter.priceMax > input.budgetMax) {
    filter.priceMax = input.budgetMax;
  }
}

function describeFacets(facets: CatalogFacets): string {
  const categories = facets.categories
    .reduce<Map<string, string[]>>((acc, entry) => {
      const subs = acc.get(entry.category) ?? [];
      if (entry.subcategory) subs.push(entry.subcategory);
      acc.set(entry.category, subs);
      return acc;
    }, new Map())
    .entries();

  const stocked = [...categories]
    .map(([category, subs]) => (subs.length > 0 ? `${category}: ${[...new Set(subs)].join(", ")}` : category))
    .join("\n");

  return [
    "This store's own categories and subcategories (the only values `category`/`subcategory` may take):",
    stocked || "(catalog still indexing)",
    "",
    "Garment vocabulary (the only values `garmentCategory`/`garmentSubcategory` may take). This is",
    "fixed and identical for every store — every product in this catalog is mapped onto it:",
    describeTaxonomy(),
    "",
    `Brands: ${facets.brands.length > 0 ? facets.brands.join(", ") : "(none recorded)"}`,
    facets.priceRange ? `Prices range from ${facets.priceRange.min} to ${facets.priceRange.max}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Builds the structural filter for a request.
 *
 * The catalog's live schema, full taxonomy and actual stocked values are injected on every
 * call rather than baked into a static prompt — they differ per merchant and change as the
 * catalog does, and a filter built from a remembered shape is a filter that matches nothing.
 */
export async function buildFilter(input: BuildFilterInput): Promise<FilterValidationResult> {
  const conversation = input.recentTurns
    .slice(-6)
    .map((turn) => `${turn.role}: ${turn.content}`)
    .join("\n");

  const context = [
    describeFacets(input.facets),
    input.anchorCategory ? `\nThe shopper is currently working with an item in: ${input.anchorCategory}.` : "",
    input.budgetMax ? `\nThe shopper's stated budget ceiling is ${input.budgetMax}.` : "",
    input.budgetMin ? `\nThe shopper's stated price floor is ${input.budgetMin} — they want nothing cheaper.` : "",
    conversation ? `\nRecent conversation:\n${conversation}` : "",
    `\nCurrent request: ${input.query}`,
  ].join("\n");

  try {
    const response = await createChatCompletion(
      input.apiKey,
      [
        { role: "system", content: loadSkill("persona/skills/filter.md").body },
        { role: "user", content: context },
      ],
      {
        tools: [buildFilterTool],
        toolChoice: { type: "function", name: "build_filter" },
        thinking: "minimal",
        timeoutMs: 15_000,
      }
    );
    addTokenCost(input.meter, response.usage?.inputTokens ?? 0, response.usage?.outputTokens ?? 0);

    const call = response.toolCalls[0];
    const raw = call ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
    const validated = validateFilter(raw, input.facets);

    // A budget the shopper stated in intake still binds even when they didn't repeat it in
    // this message.
    applyStatedBounds(validated, input);

    // The model's own arguments, before repair. Without these the retrieval log shows a filter
    // with no way to tell which half of it the model asked for and which half was stamped on
    // afterwards — the exact ambiguity that made a 200/200 price window hard to attribute.
    console.log(
      `[persona filter] raw=${JSON.stringify(raw)} bounds=${input.budgetMin ?? "-"}..${input.budgetMax ?? "-"}` +
        (validated.corrections.length > 0 ? ` corrections=${JSON.stringify(validated.corrections)}` : "")
    );

    return validated;
  } catch (err) {
    console.error("[persona filter buildFilter]", err);
    // No filter beats a wrong filter: cosine over the whole catalog still returns something
    // relevant, while a bad WHERE returns an empty shelf.
    const fallback: FilterValidationResult = { filter: {}, corrections: [] };
    applyStatedBounds(fallback, input);
    return fallback;
  }
}

/** Exposed for the ask/scoping logic, which needs to know whether a filter says anything. */
export function isEmptyFilter(filter: CatalogFilter): boolean {
  return (
    filter.category === undefined &&
    filter.subcategory === undefined &&
    filter.garmentCategory === undefined &&
    filter.garmentSubcategory === undefined &&
    filter.brand === undefined &&
    filter.priceMin === undefined &&
    filter.priceMax === undefined
  );
}
