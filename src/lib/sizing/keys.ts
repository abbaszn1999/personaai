import { isSizingGroup, type SizingGroup } from "./measurements";

/**
 * Normalization for every string this pipeline keys on. Everything here has to be deterministic and
 * stable across runs: these values are unique-constraint components, so a normalizer that returns
 * something different for the same input on a later run silently creates duplicate coverage rows
 * and re-researches charts that were already paid for.
 */

/** Sentinel `brand_key` for the doc's `null_records` — rows where no brand could be identified.
 *
 *  An empty string rather than SQL NULL, because Postgres unique constraints treat NULLs as
 *  distinct from each other: a nullable `brand_key` would let one unbranded coverage row per scan
 *  accumulate forever instead of upserting onto itself. `normalizeBrandKey` never returns `""` for
 *  real input, so the sentinel can't collide with a brand. */
export const UNKNOWN_BRAND_KEY = "";

/**
 * Folds a brand name to a stable key: `"Nike"`, `"nike "` and `"NIKE"` are one brand, and
 * `"Levi's"` and `"Levis"` are too.
 *
 * Deliberately does *not* strip company suffixes (Inc, Ltd, Co). "Urban Basics" and "Urban Basics
 * Co" may well be two different merchants' private labels, and merging them would hand one
 * brand's chart to the other — a wrong answer, where keeping them separate only costs one extra
 * gap-fill.
 */
export function normalizeBrandKey(brand: string | null | undefined): string {
  if (!brand) return UNKNOWN_BRAND_KEY;
  return brand
    .normalize("NFD")
    // Strip combining marks so "Hermès" and "Hermes" are one key.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Canonical casing/spacing for a size label, so `" med "` and `"MED"` dedupe to one raw format.
 *
 * This is *not* size resolution — turning `"MED"` into `"M"` requires knowing the brand's real
 * label set and is the one LLM call in Phase 6. Doing any of that here would be guessing, which
 * the doc rules out ("never guessed").
 */
export function normalizeSizeLabel(label: string): string {
  return label
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[\s,;/|-]+|[\s,;/|-]+$/g, "")
    .toUpperCase();
}

/**
 * Splits a merchant's raw "available sizes" string into individual labels.
 *
 * Only splits on separators that unambiguously delimit a list. Hyphens are left alone on purpose:
 * `"XS-S"` is one label for a garment that spans two sizes, and splitting it would invent stock
 * the store never listed.
 */
export function splitRawSizeValue(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[,;/|\n]+/)) {
    const label = normalizeSizeLabel(part);
    if (label) seen.add(label);
  }
  return [...seen];
}

/**
 * Who a garment is cut for. The audience half of a chart key, and not cosmetic: a men's and a
 * women's top with the same `M` label have different chest ranges, so a chart keyed on `tops` alone
 * would return one of them to both and be wrong half the time.
 */
export const AUDIENCES = ["mens", "womens", "boys", "girls", "kids", "unisex"] as const;
export type Audience = (typeof AUDIENCES)[number];

export function isAudience(value: unknown): value is Audience {
  return typeof value === "string" && (AUDIENCES as readonly string[]).includes(value);
}

// Merchant data, not the Google Merchant enum: these arrive from `variantOptions` groups the
// merchant named and filled themselves, so "Herren", "Ladies" and "Boys 8-10" all turn up in
// practice alongside "male"/"female".
//
// Female patterns are tested first and this ordering is load-bearing: "women" contains "men" and
// "woman" contains "man", so a male-first check classifies every women's product as menswear.
const FEMALE_PATTERN = /\b(?:wom[ae]n|women'?s|female|ladies|lady|damen|femme|mujer|donna|girls?)\b/i;
const MALE_PATTERN = /\b(?:m[ae]n|men'?s|male|herren|homme|hombre|uomo|boys?)\b/i;
const CHILD_PATTERN =
  /\b(?:kids?|child(?:ren)?|junior|youth|boys?|girls?|baby|babies|infant|toddler|newborn|b[eé]b[eé])\b/i;

function matchesAny(values: readonly string[], pattern: RegExp): boolean {
  return values.some((value) => pattern.test(value));
}

/**
 * Resolves an audience from the merchant's own gender/age values, falling back to free-text hints
 * (category paths, product title) only when the structured fields say nothing.
 *
 * Returns `unisex` rather than null when nothing resolves. That is the honest answer for a scarf or
 * a genuinely unisex tee, and it keeps a real chart key available — the alternative, refusing to
 * key the product, would drop it from sizing entirely on nothing more than a missing gender field.
 */
export function audienceFor(input: {
  genders?: readonly string[] | null;
  ageGroups?: readonly string[] | null;
  hints?: readonly string[] | null;
}): Audience {
  const structured = [...(input.genders ?? []), ...(input.ageGroups ?? [])].filter(Boolean);
  const hints = (input.hints ?? []).filter(Boolean);

  // Structured fields are considered on their own first, so a "Men's Gifts" collection path can't
  // override an explicit `gender: female` on the product itself.
  for (const values of [structured, hints]) {
    if (values.length === 0) continue;

    const female = matchesAny(values, FEMALE_PATTERN);
    const male = matchesAny(values, MALE_PATTERN);
    const child = matchesAny(values, CHILD_PATTERN);

    if (child) {
      if (female && !male) return "girls";
      if (male && !female) return "boys";
      return "kids";
    }
    if (female && !male) return "womens";
    if (male && !female) return "mens";
    // Both or neither: fall through to the next source rather than picking one at random.
    if (female && male) return "unisex";
  }

  return "unisex";
}

/**
 * Whether a stored key is still one this build knows how to size.
 *
 * Replaces the old `parseSizingCategory`, which had to split `mens_tops` on its first underscore.
 * With the audience gone the key *is* the group, so reading one back is a membership test — and the
 * fragile convention that no group name may contain an underscore goes with it.
 */
export function isSizingCategory(value: unknown): value is SizingGroup {
  return isSizingGroup(value);
}

/**
 * The `sizing_chart_key` written onto every indexed ACS product. Carries the chart version so a
 * chart revision makes every product still holding the old one findable with a single ACS filter,
 * which is what makes a targeted republish possible instead of a full reindex.
 *
 * Includes the audience because one brand and group now hold several charts, and a product resolved
 * against the men's one has to be republishable without touching the women's.
 */
export function chartKey(
  brandKey: string,
  sizingCategory: string,
  audience: Audience,
  version: number
): string {
  return `${brandKey || "none"}|${sizingCategory}|${audience}|v${version}`;
}
