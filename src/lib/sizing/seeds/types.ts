import type { SizeAliasKey, SizeChartRow } from "@/lib/sizing/chart-schema";
import type { Audience } from "@/lib/sizing/keys";
import type { Measurement, SizingGroup } from "@/lib/sizing/measurements";

/**
 * A hand-transcribed global chart, verified against the brand's own published guide.
 *
 * These exist because Stage 4's research is the only writer of the shared registry, and a merchant
 * clicking Generate is the only thing that starts it — so the first store to sell a brand pays for
 * a web search and then trusts whatever came back. Seeding the brands that matter ahead of time
 * means a new merchant opens Stage 4 already covered, and it gives the extraction prompt a set of
 * known-correct answers to be measured against rather than eyeballed.
 *
 * `connectionId` is deliberately absent: a seed is global by definition. `provenance` is `manual`
 * rather than `research` for two reasons — it is true, and `deleteResearchedCharts` scopes itself to
 * `research`, so a regenerate pass can never wipe verified work.
 */
export interface SeedChart {
  brandKey: string;
  sizingCategory: SizingGroup;
  /** The brand's own wording for the table, prefixed with the audience it is cut for — 'Men',
   *  'Men Tailored Long', 'Women Bras (Wired)'. Identity, so it has to stay stable across re-seeds:
   *  Stage 5 assignments store this string, not a chart id. Also the transcriber's only place to
   *  record a fit class (Regular, Long, Big & Tall...) or garment-type word (Denim, Tailored,
   *  Wired) since `variantFitType`/`variantGarmentType` were dropped in migration `20260922040000`
   *  — every seed already stated both there too, per this field's own naming convention, so the
   *  dedicated columns asserted nothing this one didn't already say. `variantTags` in
   *  `variant-match.ts` reads this string alone for the fit-class exclusion guard. */
  variantName: string;
  /**
   * The Persona leaf keys (`women:top:blouse`) this exact chart is the authoritative table for.
   * Required, so a transcriber cannot forget it: a chart with no entry here is unreachable by
   * Stage 5's auto-match no matter how well the rest of the row is transcribed. See
   * `leafKeysFor`/`ALL_PERSONA_LEAF_KEYS` in `src/modules/store/mapping/persona-taxonomy.ts` for the
   * closed vocabulary to pick from — every leaf listed here must belong to `audience`'s department
   * and to this chart's `sizingCategory`. Leave empty for a table whose `variantName` states a fit
   * class (Big & Tall, Long, Petite...) — `variant-match.ts`'s `withoutFitClass` guard refuses to
   * auto-pick those regardless of what this array claims.
   */
  coversLeaves: string[];
  audience: Audience;
  /** The heading verbatim off the page, so a merchant can trace a variant back to its source. */
  sourceTitle: string;
  sourceUrl: string;
  chartRows: SizeChartRow[];
  /**
   * Set where the source publishes one nominal number per size instead of a range.
   *
   * Childrenswear does this as a rule — Tommy gives an infant chest as `54.25`, full stop — and it is
   * a real defect: a girth pinned to a point matches a body measuring exactly that and nobody else.
   * It is recorded rather than widened because the alternative is inventing the width, and a bound
   * this seed made up is indistinguishable downstream from one the brand published.
   *
   * The consequence is deliberate: `assessChart` flags these, the merchant sees the warning, and the
   * exclusion filter's `slack` is what gives them usable width at query time. What this flag buys is
   * that the seed test stays strict for every chart whose source *did* publish ranges, instead of the
   * pinned-girth check being switched off globally to accommodate kidswear.
   */
  sourcePublishesPointValues?: boolean;
  /**
   * Anything a transcriber had to decide that the page did not decide for them — a corrected typo,
   * a dropped column with no home in `MEASUREMENTS`, a label chosen as `size` when the table
   * printed several. Not stored on the row; this is the audit trail for the next person to re-verify
   * against a page that will have changed by then.
   */
  notes?: string[];
}

/** A bound pair as the source table prints it: `[min, max]`, either end null for open-ended, or the
 *  whole entry null where the table says `n/a` for that size. */
export type SeedBound = readonly [number | null, number | null] | null;

/**
 * Builds rows from columns, because that is the shape the source is in.
 *
 * Every published guide is a transposed table: one row per *measurement*, one column per size. A
 * row-oriented literal forces the transcriber to do that flip by hand for each of a dozen sizes,
 * which is where a misaligned chart comes from — and a chart shifted by one column is wrong in a way
 * that looks entirely plausible on screen. Here each array is one line of the page, read straight
 * across, and the flip is done once by code.
 */
export function rowsFromColumns(input: {
  sizes: readonly string[];
  aliases?: Partial<Record<SizeAliasKey, readonly (string | null)[]>>;
  bounds?: Partial<Record<Measurement, readonly SeedBound[]>>;
}): SizeChartRow[] {
  const { sizes, aliases = {}, bounds = {} } = input;

  for (const [key, values] of Object.entries(aliases)) {
    if (values && values.length !== sizes.length) {
      throw new Error(`seed alias "${key}" has ${values.length} values for ${sizes.length} sizes`);
    }
  }
  for (const [key, values] of Object.entries(bounds)) {
    if (values && values.length !== sizes.length) {
      throw new Error(`seed bound "${key}" has ${values.length} values for ${sizes.length} sizes`);
    }
  }

  return sizes.map((size, column) => {
    const row: SizeChartRow = { size };

    const rowAliases: Record<string, string> = {};
    for (const [key, values] of Object.entries(aliases)) {
      const value = values?.[column];
      if (value) rowAliases[key] = value;
    }
    if (Object.keys(rowAliases).length > 0) row.aliases = rowAliases;

    for (const [measurement, values] of Object.entries(bounds)) {
      const bound = values?.[column];
      if (!bound) continue;
      const [min, max] = bound;
      if (min !== null) (row as Record<string, unknown>)[`${measurement}_min`] = min;
      if (max !== null) (row as Record<string, unknown>)[`${measurement}_max`] = max;
    }

    return row;
  });
}

/** `[a, b]` for every size, for the columns a guide prints as a single number per size — lengths
 *  like inseam and foot length, which is how brands genuinely publish them. */
export function exact(values: readonly (number | null)[]): SeedBound[] {
  return values.map((value) => (value === null ? null : ([value, value] as const)));
}
