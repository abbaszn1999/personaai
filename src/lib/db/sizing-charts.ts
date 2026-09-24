import { db } from "@/lib/supabase/server";
import { parseSizeChart, type ChartProvenance, type SizeChartRow } from "@/lib/sizing/chart-schema";
import type { Audience } from "@/lib/sizing/keys";
import { isSizingGroup } from "@/lib/sizing/measurements";

/**
 * The registry Phase 4's web search pays to fill: measurement bounds per (brand x sizing category x
 * audience x source table).
 *
 * `connectionId` is null for a shared global-brand chart — see the migration's uniqueness comment —
 * so the resolver and this reader both have to treat "look up this brand+category" as "prefer my own
 * store's row, fall back to the shared one" rather than a single-key lookup.
 *
 * One (brand, category) returns **several** rows, not one: doc Part 5's whole point is that a brand
 * publishes however many chart *variants* it publishes — `Men`, `Men Tall`, `Women Petite` — and
 * research discovers them rather than fitting them to a list. Choosing between them is doc Part 7's
 * Chart Assignment and belongs to whoever knows the product; this module hands back the full set.
 */
export interface SizingChartRow {
  id: string;
  connectionId: string | null;
  brandKey: string;
  sizingCategory: string;
  /** Doc Part 5. The chart line this is, verbatim from the brand's guide — 'Men', 'Men Tailored
   *  Long', 'Women Bras (Wired)'. Identity, with brand and category. Free-form: the doc is explicit
   *  that there is no fixed universal variant list. The row's only fit/garment signal as of
   *  migration `20260922040000`, which dropped the `variantFitType`/`variantGarmentType` columns
   *  this used to duplicate — the naming rule ("put both in the name") means every fit or garment
   *  word either column ever held was already sitting here too. `variantTags` in `variant-match.ts`
   *  reads this string alone for the fit-class guard; `variantGarmentType`'s old job of deciding
   *  which of a brand's tables a leaf belongs to had already moved onto `coversLeaves` below. */
  variantName: string;
  /** The Persona leaf keys ("women:top:blouse") this exact row is the authoritative chart for —
   *  `sizing_charts.covers_leaves`, migration `20260922020000`. Replaces the old name/tag guess
   *  (`LEAF_GARMENT_TAGS`/`VARIANT_GARMENT_PATTERNS`/`pickVariant`'s garment pass in
   *  `variant-match.ts`, deleted alongside this column) as the source of truth for which of a
   *  brand's several charts in one `sizingCategory` a leaf binds to — see `chartsForLeaf`. Empty for
   *  a chart nothing has been assigned to yet. */
  coversLeaves: string[];
  /** Read off the source guide's own page — the URL, the section heading — rather than parsed from
   *  `variantName`. A Phase 5 matching hint, not identity. The row's only gender/audience signal as
   *  of migration `20260922030000`, which dropped the `variantGender` column this used to duplicate:
   *  every seeded chart and everything research has written stated the same gender in its own
   *  `variantName` that the page it sat on already said, so the second field never once disagreed
   *  with this one. */
  audience: Audience;
  /** Provenance, not identity: the verbatim heading of the table this was transcribed from, kept so
   *  a merchant can trace a variant back to the page it came from. */
  sourceTitle: string;
  chartRows: SizeChartRow[];
  confidence: number | null;
  sourceUrl: string | null;
  provenance: ChartProvenance;
  version: number;
  updatedAt: string;
}

/**
 * Re-parses `chart_rows` through `parseSizeChart` rather than trusting the jsonb as stored.
 *
 * This is the one place a stored alias key gets to disagree with `SIZE_ALIAS_KEYS`: a row written
 * before `fr`/`it`/`de`/`jp` were dropped from the vocabulary still has them sitting in the column
 * until it is re-researched or reseeded, and `parseAliases` silently drops anything outside the
 * current key set. Without this, a removed alias key would keep matching stock forever because
 * `rowLabels` flattens whatever is in the object, unaware the schema moved on.
 */
function rowToChart(row: Record<string, unknown>): SizingChartRow {
  const sizingCategory = row.sizing_category as string;
  const rawRows = row.chart_rows ?? [];
  const chartRows = isSizingGroup(sizingCategory) ? parseSizeChart(rawRows, sizingCategory) : ((rawRows as SizeChartRow[]) ?? []);

  return {
    id: row.id as string,
    connectionId: (row.connection_id as string | null) ?? null,
    brandKey: row.brand_key as string,
    sizingCategory,
    variantName: (row.variant_name as string | null) ?? "",
    coversLeaves: (row.covers_leaves as string[] | null) ?? [],
    audience: (row.audience as Audience) ?? "unisex",
    sourceTitle: (row.source_title as string | null) ?? "",
    chartRows,
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    sourceUrl: (row.source_url as string | null) ?? null,
    provenance: row.provenance as ChartProvenance,
    version: (row.version as number) ?? 1,
    updatedAt: row.updated_at as string,
  };
}

/**
 * The registry short-circuit's bulk read: every chart this connection can see for a set of brands,
 * scoped or shared. One query per research pass rather than one per brand — the whole point of
 * checking before spending a search request is that the check itself has to be cheap.
 */
export async function listChartsForBrands(
  connectionId: string,
  brandKeys: string[]
): Promise<SizingChartRow[]> {
  if (brandKeys.length === 0) return [];

  const { data, error } = await db
    .from("sizing_charts")
    .select("*")
    .in("brand_key", brandKeys)
    .or(`connection_id.is.null,connection_id.eq.${connectionId}`);

  if (error) {
    console.error("[db/sizing-charts listChartsForBrands]", connectionId, error);
    return [];
  }

  return ((data as Array<Record<string, unknown>>) ?? []).map(rowToChart);
}

/** Brand keys that already have a shared chart (connection_id is null), so mapping can offer them. */
export async function listSharedChartBrandKeys(): Promise<string[]> {
  const keys = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("sizing_charts")
      .select("brand_key")
      .is("connection_id", null)
      .range(from, from + pageSize - 1);
    if (error) {
      console.error("[db/sizing-charts listSharedChartBrandKeys]", error);
      return [];
    }
    const batch = (data ?? []) as Array<{ brand_key: string }>;
    for (const row of batch) if (row.brand_key) keys.add(row.brand_key);
    if (batch.length < pageSize) break;
  }
  return [...keys];
}

export interface UpsertChartInput {
  /** Null for a global brand's shared chart; a real connection id for private-label or manual. */
  connectionId: string | null;
  brandKey: string;
  sizingCategory: string;
  variantName: string;
  coversLeaves: string[];
  audience: Audience;
  sourceTitle: string;
  chartRows: SizeChartRow[];
  confidence: number | null;
  sourceUrl: string | null;
  provenance: ChartProvenance;
}

/**
 * Writes one published table's chart, replacing whatever was there for that exact table.
 *
 * Delete-then-insert like `replaceSizingCoverage`, not a Postgres upsert — the two uniqueness rules
 * (`sizing_charts_global_idx` for null connection, `sizing_charts_scoped_idx` for a real one) are two
 * different partial indexes, and Supabase's `.upsert()` only ever targets one `onConflict` target at
 * a time. A brand's global-vs-scoped-ness never changes between calls for the same key, so this never
 * needs to migrate a row from one index to the other.
 *
 * The delete is scoped down to `variant_name`, matching the index. It used to clear every chart for
 * the brand and category, which was correct when that pair held exactly one chart — now it would
 * mean each table written during a research pass deleted the one written just before it, and a brand
 * publishing fifteen variants would end with one.
 *
 * Scoped on the variant rather than on `(audience, source_title)` as it was before doc Part 5: two
 * headings can name one variant, so keying on the heading wrote the same variant twice under
 * different names, and the merchant then had to choose between duplicates in Phase 5's dropdown.
 */
export async function upsertChart(input: UpsertChartInput): Promise<boolean> {
  const query = db
    .from("sizing_charts")
    .delete()
    .eq("brand_key", input.brandKey)
    .eq("sizing_category", input.sizingCategory)
    .eq("variant_name", input.variantName);

  const { error: deleteError } =
    input.connectionId === null ? await query.is("connection_id", null) : await query.eq("connection_id", input.connectionId);

  if (deleteError) {
    console.error("[db/sizing-charts upsertChart delete]", input.brandKey, input.sizingCategory, deleteError);
    return false;
  }

  const { error } = await db.from("sizing_charts").insert({
    connection_id: input.connectionId,
    brand_key: input.brandKey,
    sizing_category: input.sizingCategory,
    variant_name: input.variantName,
    covers_leaves: input.coversLeaves,
    audience: input.audience,
    source_title: input.sourceTitle,
    chart_rows: input.chartRows,
    confidence: input.confidence,
    source_url: input.sourceUrl,
    provenance: input.provenance,
  });

  if (error) {
    console.error("[db/sizing-charts upsertChart insert]", input.brandKey, input.sizingCategory, error);
    return false;
  }

  return true;
}

/**
 * Clears the researched charts for a set of brands so a re-run actually re-runs.
 *
 * Needed because the registry short-circuit skips any brand already holding a chart above the
 * confidence bar — which is right during normal operation and exactly wrong when the reason for
 * re-running is that those charts are bad. Scoped to `provenance = 'research'` so a merchant's own
 * hand-filled work is never collateral, and to the shared rows a global brand writes.
 */
export async function deleteResearchedCharts(brandKeys: string[]): Promise<number> {
  if (brandKeys.length === 0) return 0;

  const { data, error } = await db
    .from("sizing_charts")
    .delete()
    .is("connection_id", null)
    .eq("provenance", "research")
    .in("brand_key", brandKeys)
    .select("id");

  if (error) {
    console.error("[db/sizing-charts deleteResearchedCharts]", error);
    return 0;
  }

  return ((data as unknown[]) ?? []).length;
}
