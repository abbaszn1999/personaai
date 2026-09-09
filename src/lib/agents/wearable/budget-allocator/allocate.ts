import { getGeminiClient } from "@/lib/ai/gemini";
import type { CatalogCandidate } from "@/lib/retrieval/types";
import { loadSkill, renderSkill } from "../load-skill";
import type { BundleCandidatePool } from "../stylist";

/**
 * Splits a shopper's total budget across a bundle's categories, then trims each candidate pool
 * to what that share can actually afford — before the pools ever reach the stylist's vision
 * call, per the architecture brief: retrieve wide, allocate, then trim.
 *
 * Deliberately advisory. `select-bundles.ts` drops any proposal missing a category
 * (`items.length >= pools.length`), so a split that empties one pool would silently collapse
 * the whole outfit down to "strongest individual matches" — the one failure mode this agent
 * must never cause. Every trim keeps at least `MIN_ITEMS_PER_CATEGORY`, and a category whose
 * pool can't reach that floor within its own share is passed through untrimmed instead.
 */

const ALLOCATOR_MODEL = process.env.GEMINI_CHAT_MODEL ?? "gemini-3.6-flash";

/** Floor below which a trim is refused outright — the whole point of "advisory only". */
export const MIN_ITEMS_PER_CATEGORY = 6;

export interface AllocatedPool extends BundleCandidatePool {
  /** Dollar ceiling this category was allotted. Null when no budget was stated at all, in
   *  which case every pool passes through untouched. */
  budgetShare: number | null;
}

export interface AllocateBudgetInput {
  pools: BundleCandidatePool[];
  /** Null when the shopper never stated one — a bundle can proceed without a budget, and this
   *  agent then has nothing to split. */
  totalBudget: number | null;
  styleGuide: string | null;
  /** The shopper's own words this turn, so the split can lean toward what they actually asked
   *  for (e.g. "something sharp for the jacket") rather than a fixed per-category ratio. */
  query: string;
  apiKey: string;
}

interface CategoryShare {
  category: string;
  percent: number;
}

const shareSchema = {
  type: "object",
  properties: {
    shares: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string" },
          percent: { type: "number" },
        },
        required: ["category", "percent"],
      },
    },
  },
  required: ["shares"],
};

function styleGuideLine(styleGuide: string): string {
  return `The store's aesthetic, which should lean the split: ${styleGuide}`;
}

/** Equal split across every category — the fallback when the model call fails or returns
 *  something unusable, since a wrong-but-plausible split beats no allocation at all. */
function equalShares(categories: string[]): Record<string, number> {
  const share = 1 / categories.length;
  return Object.fromEntries(categories.map((category) => [category, share]));
}

/**
 * Asks the model how to split the budget, and normalises whatever comes back into fractions
 * that sum to exactly 1 — a model returning percentages that sum to 97 or 104 is normal
 * variance, not a reason to fall back to an equal split when it clearly tried.
 */
async function requestBudgetShares(
  categories: string[],
  input: Pick<AllocateBudgetInput, "query" | "styleGuide" | "apiKey">
): Promise<Record<string, number>> {
  const prompt = renderSkill(loadSkill("budget-allocator/skills/allocate.md").body, {
    query: input.query,
    categories: categories.join(", "),
    styleGuide: input.styleGuide ? styleGuideLine(input.styleGuide) : "",
  });

  console.log(
    `[budget-allocator] styleGuide=${input.styleGuide ? `present (${input.styleGuide.length} chars)` : "absent"} categories=${categories.join(",")}`
  );

  try {
    const ai = getGeminiClient(input.apiKey);
    const response = await ai.models.generateContent({
      model: ALLOCATOR_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json", responseJsonSchema: shareSchema },
    });

    const parsed = JSON.parse(response.text ?? "{}") as { shares?: CategoryShare[] };
    const byCategory = new Map(
      (parsed.shares ?? [])
        .filter((entry) => categories.includes(entry.category) && entry.percent > 0)
        .map((entry) => [entry.category, entry.percent])
    );

    // Every named category must have a positive share, or the normalisation below would divide
    // by less than the true total and silently over-allocate the categories that did answer.
    if (byCategory.size !== categories.length) return equalShares(categories);

    const total = [...byCategory.values()].reduce((sum, value) => sum + value, 0);
    return Object.fromEntries(categories.map((category) => [category, (byCategory.get(category) ?? 0) / total]));
  } catch (err) {
    console.error("[budget-allocator allocate]", err);
    return equalShares(categories);
  }
}

/** Ranked already by retrieval, so keeping list order is keeping the best matches first. */
function trimPool(candidates: CatalogCandidate[], budgetShare: number): CatalogCandidate[] {
  const affordable = candidates.filter((candidate) => candidate.price === null || candidate.price <= budgetShare);
  return affordable.length >= MIN_ITEMS_PER_CATEGORY ? affordable : candidates;
}

/**
 * The pure, fully-tested core: given a percentage share per category (assumed to already sum to
 * ~1) and a total budget, trims each pool to what its dollar share affords.
 *
 * Kept separate from `allocateBudget` so the trimming and floor rules can be tested without a
 * Gemini call in every case — only the share request itself needs mocking.
 */
export function applyBudgetShares(
  pools: BundleCandidatePool[],
  shares: Record<string, number>,
  totalBudget: number
): AllocatedPool[] {
  return pools.map((pool) => {
    const fraction = shares[pool.category] ?? 1 / pools.length;
    const budgetShare = Math.round(totalBudget * fraction * 100) / 100;
    return { category: pool.category, candidates: trimPool(pool.candidates, budgetShare), budgetShare };
  });
}

export async function allocateBudget(input: AllocateBudgetInput): Promise<AllocatedPool[]> {
  if (input.totalBudget === null || input.pools.length === 0) {
    return input.pools.map((pool) => ({ ...pool, budgetShare: null }));
  }

  const categories = input.pools.map((pool) => pool.category);
  const shares = await requestBudgetShares(categories, input);
  return applyBudgetShares(input.pools, shares, input.totalBudget);
}
