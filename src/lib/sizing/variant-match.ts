import type { Audience } from "./keys";
import {
  ALL_PERSONA_LEAF_KEYS,
  personaSizingGroup,
} from "@/modules/store/mapping/persona-taxonomy";
import type { SizingGroup } from "./measurements";

/**
 * Which chart variants a merchant path may be bound to, and which one to pick without asking.
 *
 * Split out of `assignments.ts` because two separate decisions were being made by one loop with no
 * names for either: *may* this chart size this path (an audience question, and a hard constraint),
 * and *should* it (a garment question, and a preference). Conflating them is what let a men's suit
 * path be offered `Kids Bathrobes`.
 *
 * Pure and leaf-driven. Nothing here reads the database or the merchant's free text — the Persona
 * path is already a canonical key, which is the whole reason this can be deterministic.
 */

/**
 * Persona department → audience. A total map, deliberately: every department has exactly one
 * audience and always will, because the department *is* the audience question the merchant answered
 * in the Categories tab.
 *
 * This replaces regex-matching the breadcrumb with `audienceFor`. That function exists for raw
 * merchant strings — "Herren", "Ladies", "Boys 8-10" — where guessing is the only option. A Persona
 * path is not raw: `kids-girls:bottom:skirt` states its audience in the key. Matching it with a
 * regex meant `unisex` came back both for a genuinely unisex path and for "nothing resolved", which
 * is why auto-match had to refuse to act on it at all.
 */
const DEPARTMENT_AUDIENCE: Record<string, Audience> = {
  women: "womens",
  men: "mens",
  unisex: "unisex",
  "kids-boys": "boys",
  "kids-girls": "girls",
  "kids-unisex": "kids",
};

/** The leaf a Persona path key ends in — `jean` from `women:bottom:jean`. Empty for a category-level
 *  mapping (`women:bottom:`), which carries no garment signal and is treated as untagged. */
export function leafOfPersonaPath(categoryId: string): string {
  const parts = categoryId.split(":");
  return parts.length === 3 ? parts[2] : "";
}

/**
 * The audience a path is sized for, or null when the key is not a Persona path.
 *
 * Null rather than a fallback guess: rows written before Universal Mapping key on the merchant's own
 * category id, and inventing an audience for those would filter their candidate list on a value
 * nobody supplied. Callers treat null as "do not constrain", which leaves those rows exactly as they
 * behaved before.
 */
export function audienceForPersonaPath(categoryId: string): Audience | null {
  return DEPARTMENT_AUDIENCE[categoryId.split(":")[0]] ?? null;
}

const CHILD_AUDIENCES = new Set<Audience>(["boys", "girls", "kids"]);

/**
 * Whether a chart may size a path at all. The hard constraint, and the one that was missing.
 *
 * Three rules, in the order they matter:
 *
 * 1. **Never cross the adult/child line.** This is the rule that fixes the reported bug. A womenswear
 *    bottoms path was being offered `Boys`, `Girls` and `Infant`, whose rows are keyed on a child's
 *    height. There is no reading of a 62-68cm height range that sizes an adult.
 * 2. **Within children, everything is compatible.** `boys`, `girls` and `kids` are not three bodies
 *    but three ways a brand chose to file one growth curve, and an `Infant` table genuinely serves a
 *    kids-boys path for the ages it covers. Refusing the cross would leave most kids paths with no
 *    candidate at all while a usable chart sat one row away.
 * 3. **Within adults, `unisex` bridges and nothing else does.** A unisex chart sizes anyone — that is
 *    what the word means — and a unisex *path* can be sized by either adult chart, because the
 *    garment is sold to both and only the merchant knows which block it was cut on. But a men's chart
 *    may not size a women's path: same label, different chest range, wrong half the time.
 */
export function audienceCompatible(path: Audience, chart: Audience): boolean {
  const pathIsChild = CHILD_AUDIENCES.has(path);
  if (pathIsChild !== CHILD_AUDIENCES.has(chart)) return false;
  if (pathIsChild) return true;
  return path === chart || path === "unisex" || chart === "unisex";
}

/**
 * A fit class: something about *whose body* the block was cut for — Big & Tall, Petite, Long.
 *
 * Deliberately never derivable from a leaf, and that is the point rather than a gap. A Big & Tall
 * shirt and a regular shirt sit in the same category with the same name; which one a shopper needs is
 * a fact about the shopper, not about the path. So a fit class disqualifies a variant from being
 * auto-picked — a merchant must choose it, or nobody should.
 *
 * `Regular` is absent on purpose: it names the absence of a fit class, so tagging it would leave a
 * brand's default table with nothing to fall back to.
 *
 * `wired`, `denim`, `tailored` and every other garment-type word are absent too, and used to be here
 * under a since-deleted `GarmentTag` — a wired and a wireless bra are two different garments sold to
 * the same body, exactly like `denim` and a plain trouser, and grouping garment-type words with
 * `Big & Tall` meant the one bra table this catalog seeds (`Women Bras (Wired)`) could never be
 * auto-picked even for the `bra` leaf it is the sole answer to. Garment-type coverage now lives on
 * `covers_leaves` (`sizing_charts.covers_leaves`, migration `20260922020000`) as an explicit,
 * per-chart leaf list rather than a name/tag guess — see `chartsForLeaf` below.
 */
export type FitTag = "big-tall" | "long" | "short" | "petite" | "tall" | "plus" | "curve" | "maternity" | "slim" | "husky";

const VARIANT_FIT_PATTERNS: readonly (readonly [FitTag, RegExp])[] = [
  ["big-tall", /\bbig\s*&?\s*tall\b/],
  ["long", /\blong\b/],
  ["short", /\bshort\b/],
  ["petite", /\bpetite\b/],
  ["tall", /\btall\b/],
  ["plus", /\bplus\b/],
  ["curve", /\bcurve\b/],
  ["maternity", /\bmaternity\b/],
  ["slim", /\bslim\b/],
  ["husky", /\bhusky\b/],
];

export interface VariantTags {
  fit: FitTag[];
}

/**
 * The fit tags for one variant, read from its name alone.
 *
 * Used to read `variant_name` plus a separate `variant_fit_type` column, on the theory that a brand
 * might state a fit line only in the structured field and never in the heading itself. That never
 * happened: the research prompt and every seed both require the fit word to sit in `variant_name`
 * too ("put both in the name... so the two stay distinguishable" — two variants in one group can
 * never share a name, so the word has nowhere else to hide). `variant_fit_type` asserted nothing
 * `variant_name` didn't already say, so it was dropped in migration `20260922040000` along with
 * `variant_garment_type`, which this function never read.
 */
export function variantTags(variantName: string): VariantTags {
  const text = variantName.toLowerCase();
  return {
    fit: VARIANT_FIT_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag),
  };
}

/** The shape `chartsForLeaf` needs. Kept minimal so it can be called with a chart row or an
 *  `AssignableVariant` without either module depending on the other. */
export interface MatchableVariant {
  variantName: string;
  /** The Persona leaf keys this exact chart claims — `sizing_charts.covers_leaves`. The only signal
   *  `chartsForLeaf` matches on; nothing here is inferred from the variant's own name or fields. */
  coversLeaves: string[];
}

/**
 * The one variant a leaf can be bound to without asking, or null to leave it for the merchant.
 *
 * Replaces the old two-pass `pickVariant`, which read `LEAF_GARMENT_TAGS` (a closed list of which
 * leaves imply which garment word) against `VARIANT_GARMENT_PATTERNS` (a regex guess at which
 * garment word a variant's own name states) to find a specialized table, then fell back to
 * whichever table carried no garment tag at all. That worked for a hand-seeded catalog small enough
 * to enumerate every leaf's garment word up front, but it could not scale to research running across
 * thousands of brands: deciding which of a brand's five "tops" tables a leaf belongs to is a judgment
 * call, not a pattern match, and every brand phrases its headings differently. `covers_leaves` moves
 * that judgment call onto the chart itself — stated once, by whoever transcribed or researched it —
 * so matching becomes a plain membership test instead of two guesses stacked on each other.
 *
 * Still drops anything carrying a fit class before returning, which is what lets a leaf resolve to
 * `Men Tailored` while `Men Tailored Long` and `Men Tailored Short` stay available for a merchant who
 * knows their stock is long. In practice this guard is now redundant with authors never listing a
 * leaf on a fit-class table's `covers_leaves` (see the LEAF COVERAGE instructions in `research.ts`
 * and the seed notes in `src/lib/sizing/seeds`) — it stays here anyway, because trusting that
 * invariant to hold everywhere it is written is exactly the kind of trust this module exists to not
 * extend.
 *
 * Returning null is a real outcome: no candidate claims the leaf at all (nothing published, or the
 * brand's specialized table for it doesn't exist), or more than one candidate claims it — which is
 * how the age-disjoint kids case surfaces now (an `Infant` table and a `Boys & Girls` table both
 * legitimately claiming one `kids-unisex` footwear leaf, deliberately, because only the merchant
 * knows the age band). Guessing either case would report the path as governed when it either isn't
 * or is ambiguous.
 */
export function chartsForLeaf<T extends MatchableVariant>(leafKey: string, candidates: readonly T[]): T | null {
  if (!leafKey) return null;

  const claimed = candidates
    .filter((variant) => variant.coversLeaves.includes(leafKey))
    .map((variant) => ({ variant, tags: variantTags(variant.variantName) }));

  return withoutFitClass(claimed);
}

/** The one survivor with no fit class. Null for none, for an ambiguous several, and for exactly one
 *  candidate that itself carries a fit tag, which the caller reads the same way as "several": leave
 *  it to the merchant. */
function withoutFitClass<T extends MatchableVariant>(
  entries: readonly { variant: T; tags: VariantTags }[]
): T | null {
  const plain = entries.filter((entry) => entry.tags.fit.length === 0);
  return plain.length === 1 ? plain[0].variant : null;
}

const ALL_PERSONA_LEAF_KEY_SET = new Set<string>(ALL_PERSONA_LEAF_KEYS);

/**
 * Keeps only the leaves a chart is actually entitled to claim: a real leaf key, whose department is
 * audience-compatible with this chart's own audience, and whose category maps to this chart's own
 * sizing group. Shared by every writer of `covers_leaves` — the one-call research parser and the
 * manual chart API route — so the same rule holds no matter who is stating coverage.
 *
 * Defensive rather than trusting the writer (a model's LEAF COVERAGE instructions, a merchant typing
 * into a checklist) to get it right every time: a leaf claimed outside its rightful audience/group is
 * a wrong chart assignment downstream — `chartsForLeaf` would hand a men's chart to a womens path —
 * not a cosmetic slip, so it is dropped here rather than stored.
 */
export function sanitizeCoverage(
  raw: unknown,
  chartAudience: Audience,
  chartGroup: SizingGroup,
  /** Purely for the console warning below — the chart's own title or variant name. */
  label?: string
): string[] {
  if (!Array.isArray(raw)) return [];

  const kept: string[] = [];
  let dropped = 0;
  for (const value of raw) {
    if (typeof value !== "string" || !ALL_PERSONA_LEAF_KEY_SET.has(value)) {
      dropped += 1;
      continue;
    }
    const deptId = value.split(":")[0] ?? "";
    const catId = value.split(":")[1] ?? "";
    const leafAudience = audienceForPersonaPath(deptId);
    const leafGroup = personaSizingGroup(catId);
    if (!leafAudience || !audienceCompatible(leafAudience, chartAudience) || leafGroup !== chartGroup) {
      dropped += 1;
      continue;
    }
    kept.push(value);
  }

  if (dropped > 0 && label) {
    console.warn(
      `[sizing coverage] "${label}" (${chartAudience}/${chartGroup}): dropped ${dropped} covers_leaves ` +
        `entr${dropped === 1 ? "y" : "ies"} outside this chart's own audience/group.`
    );
  }

  return kept;
}
