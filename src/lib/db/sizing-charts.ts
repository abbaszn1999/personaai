import { db } from "@/lib/supabase/server";
import type { ChartProvenance, ChartRegion, SizeChartRow } from "@/lib/sizing/chart-schema";
import type { Audience } from "@/lib/sizing/keys";

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
  /** Doc Part 5. The chart line this is, verbatim from the brand's guide. Identity, with brand and
   *  category. Free-form: the doc is explicit that there is no fixed universal variant list. */
  variantName: string;
  /** The gender inside `variantName`, split out so Phase 5 can auto-match `Men > Blazers` to the
   *  men's variant. Null when the guide never says. */
  variantGender: Audience | null;
  /** The fit line inside `variantName` — Regular, Tall, Petite. Null when the brand publishes one. */
  variantFitType: string | null;
  /** Read off the source guide's own page. A Phase 5 matching hint since this migration, not
   *  identity — `variantName` already carries the gender wherever the brand states it. */
  audience: Audience;
  /** Provenance, not identity: the verbatim heading of the table this was transcribed from, kept so
   *  a merchant can trace a variant back to the page it came from. */
  sourceTitle: string;
  region: ChartRegion | null;
  chartRows: SizeChartRow[];
  confidence: number | null;
  sourceUrl: string | null;
  provenance: ChartProvenance;
  version: number;
  updatedAt: string;
}

function rowToChart(row: Record<string, unknown>): SizingChartRow {
  return {
    id: row.id as string,
    connectionId: (row.connection_id as string | null) ?? null,
    brandKey: row.brand_key as string,
    sizingCategory: row.sizing_category as string,
    variantName: (row.variant_name as string | null) ?? "",
    variantGender: (row.variant_gender as Audience | null) ?? null,
    variantFitType: (row.variant_fit_type as string | null) ?? null,
    audience: (row.audience as Audience) ?? "unisex",
    sourceTitle: (row.source_title as string | null) ?? "",
    region: (row.region as ChartRegion | null) ?? null,
    chartRows: (row.chart_rows as SizeChartRow[]) ?? [],
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

export interface UpsertChartInput {
  /** Null for a global brand's shared chart; a real connection id for private-label or manual. */
  connectionId: string | null;
  brandKey: string;
  sizingCategory: string;
  variantName: string;
  variantGender: Audience | null;
  variantFitType: string | null;
  audience: Audience;
  sourceTitle: string;
  region: ChartRegion | null;
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
    variant_gender: input.variantGender,
    variant_fit_type: input.variantFitType,
    audience: input.audience,
    source_title: input.sourceTitle,
    region: input.region,
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
