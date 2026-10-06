import { db } from "@/lib/supabase/server";
import {
  parseSizeChart,
  type ChartApplicability,
  type ChartProvenance,
  type SizeChartRow,
  type SourceVerification,
} from "@/lib/sizing/chart-schema";
import type { Audience } from "@/lib/sizing/keys";
import { isMeasurement, isSizingGroup, type Measurement } from "@/lib/sizing/measurements";

/**
 * Measurement bounds from two deliberately isolated stores:
 *
 * - `sizing_charts`: shared, verified global-brand charts only.
 * - `sizing_charts_private`: one connection's private-label and unbranded charts only.
 *
 * One (brand, category) can return several published tables. `covers_leaves` is the sole assignment
 * truth; fit-class-only tables remain review material and never receive ordinary leaf coverage.
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
   *  brand's several charts in one `sizingCategory` a leaf resolves to. Empty for a chart that
   *  claims no Persona leaf. */
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
  sourceTableId?: string;
  applicability?: ChartApplicability;
  decidingMeasurements?: Measurement[];
  sourceVerification?: SourceVerification | null;
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
  const audience = (row.audience as Audience) ?? "unisex";
  const rawRows = row.chart_rows ?? [];
  const decidingMeasurements = Array.isArray(row.deciding_measurements)
    ? row.deciding_measurements.filter(isMeasurement)
    : [];
  const chartRows = isSizingGroup(sizingCategory)
    ? parseSizeChart(rawRows, sizingCategory, audience, decidingMeasurements)
    : ((rawRows as SizeChartRow[]) ?? []);

  return {
    id: row.id as string,
    connectionId: (row.connection_id as string | null) ?? null,
    brandKey: row.brand_key as string,
    sizingCategory,
    variantName: (row.variant_name as string | null) ?? "",
    coversLeaves: (row.covers_leaves as string[] | null) ?? [],
    audience,
    sourceTitle: (row.source_title as string | null) ?? "",
    sourceTableId: (row.source_table_id as string | null) ?? "",
    applicability:
      row.applicability && typeof row.applicability === "object"
        ? (row.applicability as ChartApplicability)
        : {},
    decidingMeasurements,
    sourceVerification:
      row.source_verification &&
      typeof row.source_verification === "object" &&
      typeof (row.source_verification as Record<string, unknown>).verifiedAt === "string"
        ? (row.source_verification as unknown as SourceVerification)
        : null,
    chartRows,
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    sourceUrl: (row.source_url as string | null) ?? null,
    provenance: row.provenance as ChartProvenance,
    version: (row.version as number) ?? 1,
    updatedAt: row.updated_at as string,
  };
}

/** Shared global charts only. Research and canonical-brand proof must use this function. */
export async function listSharedChartsForBrands(brandKeys: string[]): Promise<SizingChartRow[]> {
  if (brandKeys.length === 0) return [];

  const rows: Array<Record<string, unknown>> = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("sizing_charts")
      .select("*")
      .in("brand_key", brandKeys)
      .order("id")
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("[db/sizing-charts listSharedChartsForBrands]", error);
      return [];
    }

    const batch = (data ?? []) as Array<Record<string, unknown>>;
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return rows.map(rowToChart);
}

/** Private-label and unbranded charts belonging to exactly one connection. */
export async function listPrivateChartsForBrands(
  connectionId: string,
  brandKeys: string[],
): Promise<SizingChartRow[]> {
  if (brandKeys.length === 0) return [];

  const rows: Array<Record<string, unknown>> = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("sizing_charts_private")
      .select("*")
      .eq("connection_id", connectionId)
      .in("brand_key", brandKeys)
      .order("id")
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("[db/sizing-charts listPrivateChartsForBrands]", connectionId, error);
      return [];
    }

    const batch = (data ?? []) as Array<Record<string, unknown>>;
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return rows.map(rowToChart);
}

/** Canonical brand targets already proven by a shared researched chart. */
export async function listSharedChartBrandKeys(): Promise<string[]> {
  const keys = new Set<string>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("sizing_charts")
      .select("brand_key")
      .order("id")
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("[db/sizing-charts listSharedChartBrandKeys]", error);
      return [];
    }

    const batch = (data ?? []) as Array<{ brand_key: string }>;
    for (const row of batch) {
      if (row.brand_key) keys.add(row.brand_key);
    }
    if (batch.length < pageSize) break;
  }

  return [...keys].sort();
}

interface ChartWrite {
  brandKey: string;
  sizingCategory: string;
  variantName: string;
  coversLeaves: string[];
  audience: Audience;
  sourceTitle: string;
  sourceTableId?: string;
  applicability?: ChartApplicability;
  decidingMeasurements?: Measurement[];
  sourceVerification?: SourceVerification | null;
  chartRows: SizeChartRow[];
  confidence: number | null;
  sourceUrl: string | null;
  provenance: ChartProvenance;
}

/**
 * Writes a verified shared global-brand chart. No connection-scoped input is accepted, so private
 * chart data cannot enter the global registry through this function.
 */
export async function upsertSharedChart(input: ChartWrite): Promise<boolean> {
  if (!isSizingGroup(input.sizingCategory)) return false;
  const chartRows = parseSizeChart(
    input.chartRows,
    input.sizingCategory,
    input.audience,
    input.decidingMeasurements,
  );
  const { data: existing, error: existingError } = await db
    .from("sizing_charts")
    .select("*")
    .eq("brand_key", input.brandKey)
    .eq("sizing_category", input.sizingCategory)
    .eq("variant_name", input.variantName)
    .maybeSingle();

  if (existingError) {
    console.error("[db/sizing-charts upsertSharedChart read]", input.brandKey, input.sizingCategory, existingError);
    return false;
  }

  if (existing) {
    const old = existing as Record<string, unknown>;
    const { error: historyError } = await db.from("sizing_chart_versions").upsert({
      chart_id: old.id,
      brand_key: old.brand_key,
      sizing_category: old.sizing_category,
      variant_name: old.variant_name,
      version: old.version ?? 1,
      snapshot: old,
    }, { onConflict: "chart_id,version", ignoreDuplicates: true });
    if (historyError) {
      console.error("[db/sizing-charts upsertSharedChart archive]", input.brandKey, input.sizingCategory, historyError);
      return false;
    }
  }

  const { error: deleteError } = await db
    .from("sizing_charts")
    .delete()
    .eq("brand_key", input.brandKey)
    .eq("sizing_category", input.sizingCategory)
    .eq("variant_name", input.variantName);

  if (deleteError) {
    console.error("[db/sizing-charts upsertSharedChart delete]", input.brandKey, input.sizingCategory, deleteError);
    return false;
  }

  const { error } = await db.from("sizing_charts").insert({
    connection_id: null,
    brand_key: input.brandKey,
    sizing_category: input.sizingCategory,
    variant_name: input.variantName,
    covers_leaves: input.coversLeaves,
    audience: input.audience,
    source_title: input.sourceTitle,
    source_table_id: input.sourceTableId ?? "",
    applicability: input.applicability ?? {},
    deciding_measurements: input.decidingMeasurements ?? [],
    source_verification: input.sourceVerification ?? {},
    version: existing ? Number((existing as Record<string, unknown>).version ?? 1) + 1 : 1,
    chart_rows: chartRows,
    confidence: input.confidence,
    source_url: input.sourceUrl,
    provenance: input.provenance,
  });

  if (error) {
    console.error("[db/sizing-charts upsertSharedChart insert]", input.brandKey, input.sizingCategory, error);
    return false;
  }

  return true;
}

export type PrivateChartWriteResult =
  | { ok: true; id: string }
  | { ok: false; reason: "name_conflict" | "not_found" | "invalid" | "error" };

const UNIQUE_VIOLATION = "23505";

function privateChartPayload(input: ChartWrite, chartRows: SizeChartRow[]) {
  return {
    brand_key: input.brandKey,
    sizing_category: input.sizingCategory,
    variant_name: input.variantName,
    covers_leaves: input.coversLeaves,
    audience: input.audience,
    source_title: input.sourceTitle,
    source_table_id: input.sourceTableId ?? "",
    applicability: input.applicability ?? {},
    deciding_measurements: input.decidingMeasurements ?? [],
    source_verification: input.sourceVerification ?? {},
    chart_rows: chartRows,
    confidence: input.confidence,
    source_url: input.sourceUrl,
    provenance: input.provenance,
  };
}

/**
 * Adds one store's private-label or unbranded chart. A second chart with the same
 * (brand, category, name) is refused rather than replaced: the previous delete-then-insert silently
 * destroyed a chart the merchant had saved for different subcategories under a reused name, and a
 * failed insert after the delete lost the old one outright.
 */
export async function insertPrivateChart(
  input: ChartWrite & { connectionId: string },
): Promise<PrivateChartWriteResult> {
  if (!isSizingGroup(input.sizingCategory)) return { ok: false, reason: "invalid" };
  const chartRows = parseSizeChart(
    input.chartRows,
    input.sizingCategory,
    input.audience,
    input.decidingMeasurements,
  );

  const { data, error } = await db
    .from("sizing_charts_private")
    .insert({ connection_id: input.connectionId, ...privateChartPayload(input, chartRows) })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: "name_conflict" };
    console.error("[db/sizing-charts insertPrivateChart]", input.brandKey, input.sizingCategory, error);
    return { ok: false, reason: "error" };
  }

  return { ok: true, id: (data as { id: string }).id };
}

/** Edits a private chart in place by id, so renaming it or changing its coverage never needs a delete. */
export async function updatePrivateChartById(
  connectionId: string,
  chartId: string,
  input: ChartWrite,
): Promise<PrivateChartWriteResult> {
  if (!isSizingGroup(input.sizingCategory)) return { ok: false, reason: "invalid" };
  const chartRows = parseSizeChart(
    input.chartRows,
    input.sizingCategory,
    input.audience,
    input.decidingMeasurements,
  );

  const { data, error } = await db
    .from("sizing_charts_private")
    .update({ ...privateChartPayload(input, chartRows), updated_at: new Date().toISOString() })
    .eq("id", chartId)
    .eq("connection_id", connectionId)
    .eq("brand_key", input.brandKey)
    .eq("sizing_category", input.sizingCategory)
    .select("id");

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: "name_conflict" };
    console.error("[db/sizing-charts updatePrivateChartById]", chartId, error);
    return { ok: false, reason: "error" };
  }

  const rows = (data as Array<{ id: string }> | null) ?? [];
  return rows.length > 0 ? { ok: true, id: rows[0].id } : { ok: false, reason: "not_found" };
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
    .eq("provenance", "research")
    .in("brand_key", brandKeys)
    .select("id");

  if (error) {
    console.error("[db/sizing-charts deleteResearchedCharts]", error);
    return 0;
  }

  return ((data as unknown[]) ?? []).length;
}
