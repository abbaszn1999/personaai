import { rowLabels, type SizeAliasKey, type SizeChartRow } from "./chart-schema";
import { normalizeSizeLabel, splitRawSizeValue } from "./keys";
import { sizeTypeAliasKey, type SizeType } from "./size-types";

/**
 * Phase 6's matcher — the piece that was missing while `rowLabels` was the only reader of
 * `aliases`.
 *
 * `rowLabels` flattens every alias into one list because the display table (`chart-review.ts`)
 * genuinely wants every label a chart carries, regardless of system. Matching a merchant's raw
 * stock string is a different question: the store has *declared* which system it writes in
 * (`SizeType`/`sizeTypeFor`), and a match against that declared key is a different quality of
 * evidence than a match found by ignoring it. A `US`-declared store whose stock says `41` and a
 * chart whose only `41` is printed under `eu` should not silently auto-match — the merchant may
 * have written a European size by habit, or the two `41`s may not be the same body at all.
 *
 * Three passes, most confident first:
 *   1. The store's declared system, checked against the row's primary `size` as well as its own
 *      alias key — `parseAliases` drops an alias equal to `size`, so a row's declared-system value
 *      sometimes lives in `size` itself, not in `aliases[declaredKey]`.
 *   2. `alpha`, unless that was already the declared system. S/M/L is not a claim about a market
 *      (`REGIONAL_ALIAS_KEYS` excludes it for the same reason), so it is worth trying before
 *      conceding — a store that declared `EU` but stocks `M` should still match the alpha column.
 *   3. Every other label the chart carries, `rowLabels`' full flatten. A hit here is a real label
 *      match, just not the declared system, so callers should treat it as needing confirmation
 *      rather than trusting it the way a declared-system hit is trusted.
 */
export interface LabelMatch {
  /** The merchant's own label, as normalized for comparison. */
  raw: string;
  row: SizeChartRow | null;
  /** Which key produced the match, or `null` for a pass-3 widened match that answered to no
   *  system in particular that the store declared. */
  matchedVia: SizeAliasKey | null;
}

/**
 * Whether `row.size` can stand in for `key` when the row has no explicit `aliases[key]`.
 *
 * `size` carries no tag of its own system, so trusting it for whichever key happens to be asked
 * would make every declared system match any row whose primary label equals the target — exactly
 * the key-blindness this module exists to fix, just moved one level down. The one case `size` is
 * safe to trust is when nothing else on the row claims that same value: a fresh single-request
 * chart deliberately sets `size` to the merchant's own observed system and, per `parseAliases`,
 * never duplicates it into `aliases`, so an explicit rival claim is the signal that `size` belongs
 * to that other system instead.
 */
function primaryClaimedByOtherKey(row: SizeChartRow, key: SizeAliasKey, sizeNormalized: string): boolean {
  for (const [otherKey, value] of Object.entries(row.aliases ?? {})) {
    if (otherKey === key) continue;
    if (value && normalizeSizeLabel(value) === sizeNormalized) return true;
  }
  return false;
}

function matchesKey(row: SizeChartRow, key: SizeAliasKey, target: string): boolean {
  const aliasValue = row.aliases?.[key];
  if (aliasValue !== undefined) return normalizeSizeLabel(aliasValue) === target;

  const sizeNormalized = normalizeSizeLabel(row.size);
  if (sizeNormalized !== target) return false;
  return !primaryClaimedByOtherKey(row, key, sizeNormalized);
}

export function matchLabel(rawLabel: string, rows: readonly SizeChartRow[], sizeType: SizeType): LabelMatch {
  const target = normalizeSizeLabel(rawLabel);
  if (!target) return { raw: rawLabel, row: null, matchedVia: null };

  const declaredKey = sizeTypeAliasKey(sizeType);

  for (const row of rows) {
    if (matchesKey(row, declaredKey, target)) return { raw: rawLabel, row, matchedVia: declaredKey };
  }

  if (declaredKey !== "alpha") {
    for (const row of rows) {
      if (matchesKey(row, "alpha", target)) return { raw: rawLabel, row, matchedVia: "alpha" };
    }
  }

  for (const row of rows) {
    if (rowLabels(row).some((label) => normalizeSizeLabel(label) === target)) {
      return { raw: rawLabel, row, matchedVia: null };
    }
  }

  return { raw: rawLabel, row: null, matchedVia: null };
}

/** One coverage row's raw format (`"S,M,L"`) resolved label-by-label against one chart. */
export interface RawFormatMatch {
  raw: string;
  matches: LabelMatch[];
  /** Every label in the format resolved to some row — declared system or not. */
  fullyMatched: boolean;
  /** At least one label only resolved on the widened, undeclared-system pass. */
  needsReview: boolean;
}

export function matchRawFormat(raw: string, rows: readonly SizeChartRow[], sizeType: SizeType): RawFormatMatch {
  const matches = splitRawSizeValue(raw).map((label) => matchLabel(label, rows, sizeType));
  return {
    raw,
    matches,
    fullyMatched: matches.length > 0 && matches.every((match) => match.row !== null),
    needsReview: matches.some((match) => match.row !== null && match.matchedVia === null),
  };
}

/**
 * The `canonical` half of `CoverageRow.rawFormats` (`aggregate.ts`), filled in.
 *
 * Deliberately not called from `CoverageAggregator` itself: the aggregator folds the scan before
 * any chart exists for the brand, and — for a brand with several variants (`Men`, `Men Tailored`,
 * `Men Big & Tall`) — there is no single chart to resolve against until Stage 5 assignment has
 * picked one for the product's Persona leaf. This is the function that assignment's resolver
 * (`assignments.ts` / the Phase 9 index pass) calls once it has: pass the assigned variant's rows
 * and the store's declared `SizeType`, get back the canonical labels or `null` if the format does
 * not fully resolve against that chart.
 */
export function canonicalSizesForRawFormat(
  raw: string,
  rows: readonly SizeChartRow[],
  sizeType: SizeType
): string[] | null {
  const { matches, fullyMatched } = matchRawFormat(raw, rows, sizeType);
  if (!fullyMatched) return null;
  return matches.map((match) => match.row!.size);
}
