import { db } from "@/lib/supabase/server";
import type { CoverageRow } from "@/lib/sizing/aggregate";

/**
 * What a store actually carries, one row per (brand x audience-scoped sizing category).
 *
 * This is the aggregate that stands in for a product table. Read as the `categories_needed` input to
 * chart research, at index time to decode this store's own raw size strings into a brand's real
 * labels, and by a delta sync to tell a genuinely new brand from an already-covered one.
 */

export const BRAND_TYPES = ["unclassified", "global", "private", "none"] as const;

/** How a brand routes after classification.
 *  - `global`   recognizable brand with a findable public chart -> web research
 *  - `private`  a store's own label, no public chart exists -> manual fill
 *  - `none`     no brand on these rows at all -> manual fill, grouped by category
 *  `none` is deliberately not the same as `unclassified`: routing reads this column directly, so
 *  collapsing the two would send unbranded rows to the paid web-search queue. */
export type BrandType = (typeof BRAND_TYPES)[number];

export const RESEARCH_STATUSES = ["pending", "found", "not_found", "not_covered", "failed"] as const;

/** Why this row does or does not have a chart behind it. See the column comment in
 *  20260904100000_sizing_research_outcomes.sql — an absent chart has several causes that need
 *  different things from the merchant, and `pending` covers both "not researched yet" and the
 *  private/unbranded rows that are never researched at all. */
export type ResearchStatus = (typeof RESEARCH_STATUSES)[number];

export interface SizingCoverageRow extends CoverageRow {
  id: string;
  connectionId: string;
  brandType: BrandType;
  researchStatus: ResearchStatus;
  researchNote: string | null;
  updatedAt: string;
}

function rowToCoverage(row: Record<string, unknown>): SizingCoverageRow {
  return {
    id: row.id as string,
    connectionId: row.connection_id as string,
    brandKey: (row.brand_key as string) ?? "",
    brandName: (row.brand_name as string | null) ?? null,
    brandType: (row.brand_type as BrandType) ?? "unclassified",
    sizingCategory: row.sizing_category as string,
    skuCount: (row.sku_count as number) ?? 0,
    storeCategoryPaths: (row.store_category_paths as string[][]) ?? [],
    sampleSkus: (row.sample_skus as SizingCoverageRow["sampleSkus"]) ?? [],
    rawFormats: (row.raw_formats as SizingCoverageRow["rawFormats"]) ?? {},
    audienceHints: (row.audience_hints as SizingCoverageRow["audienceHints"]) ?? {},
    researchStatus: (row.research_status as ResearchStatus) ?? "pending",
    researchNote: (row.research_note as string | null) ?? null,
    updatedAt: row.updated_at as string,
  };
}

/** Chunked so a store with a wide brand spread doesn't put its whole coverage set in one statement. */
const UPSERT_CHUNK = 200;

/**
 * Writes a completed scan's coverage, replacing whatever the previous scan left behind.
 *
 * Delete-then-insert rather than upsert-and-leave. A re-scan after the merchant deselects a category
 * has to be able to *remove* rows, and an upsert can only ever add or update — so brands the store
 * no longer carries would keep generating research requests and gap templates forever.
 *
 * `brand_type` is the one thing carried across: re-scanning a catalog should not throw away a
 * classification that has already been paid for, and a brand's global/private nature does not change
 * because the merchant added a collection. Rows whose brand is new come back `unclassified`, so
 * Phase 3 only ever pays for what it has not already classified.
 *
 * `research_status` deliberately does *not* survive, unlike `brand_type`. The expensive artifact of
 * research is the chart, and that lives in `sizing_charts` — where the registry short-circuit finds
 * it again without a new search. What resets is only the *reason a chart is missing*, which is worth
 * re-establishing: a brand the finder failed on last week may publish a guide today, and carrying
 * `not_found` across would mean it was never looked for again.
 */
export async function replaceSizingCoverage(connectionId: string, rows: CoverageRow[]): Promise<boolean> {
  const previousTypes = await getBrandTypes(connectionId);

  const { error: deleteError } = await db.from("sizing_coverage").delete().eq("connection_id", connectionId);
  if (deleteError) {
    console.error("[db/sizing-coverage replaceSizingCoverage delete]", connectionId, deleteError);
    return false;
  }

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const payload = rows.slice(i, i + UPSERT_CHUNK).map((row) => ({
      connection_id: connectionId,
      brand_key: row.brandKey,
      brand_name: row.brandName,
      brand_type: previousTypes.get(row.brandKey) ?? "unclassified",
      sizing_category: row.sizingCategory,
      sku_count: row.skuCount,
      store_category_paths: row.storeCategoryPaths,
      sample_skus: row.sampleSkus,
      raw_formats: row.rawFormats,
      audience_hints: row.audienceHints,
    }));

    const { error } = await db.from("sizing_coverage").insert(payload);
    if (error) {
      console.error("[db/sizing-coverage replaceSizingCoverage insert]", connectionId, error);
      return false;
    }
  }

  return true;
}

/**
 * Existing classifications keyed by brand, so a re-scan can preserve them.
 *
 * Keyed on brand rather than (brand, category) because global/private is a property of the brand
 * itself — Nike does not become a private label in the category a merchant added yesterday.
 */
async function getBrandTypes(connectionId: string): Promise<Map<string, BrandType>> {
  const { data, error } = await db
    .from("sizing_coverage")
    .select("brand_key, brand_type")
    .eq("connection_id", connectionId)
    .neq("brand_type", "unclassified");

  if (error) {
    console.error("[db/sizing-coverage getBrandTypes]", connectionId, error);
    return new Map();
  }

  const types = new Map<string, BrandType>();
  for (const row of (data as Array<Record<string, unknown>>) ?? []) {
    types.set((row.brand_key as string) ?? "", row.brand_type as BrandType);
  }
  return types;
}

export async function listSizingCoverage(connectionId: string): Promise<SizingCoverageRow[]> {
  const { data, error } = await db
    .from("sizing_coverage")
    .select("*")
    .eq("connection_id", connectionId)
    .order("sku_count", { ascending: false });

  if (error) {
    console.error("[db/sizing-coverage listSizingCoverage]", connectionId, error);
    return [];
  }

  return ((data as Array<Record<string, unknown>>) ?? []).map(rowToCoverage);
}

/**
 * Which of these brands any store has already established to be global.
 *
 * A deliberate cross-merchant read, and the only one in this module. That a brand is a real
 * manufacturer publishing a public size guide is objective and store-independent, so the second store
 * to sell Nike should not pay to work that out again. Nothing merchant-specific crosses the boundary
 * — only the brand key, which came off a public label in the first place.
 *
 * Scoped to `global` on purpose: two merchants can carry unrelated house labels under the same name,
 * so inheriting a `private` verdict would hand one merchant's decision to another.
 */
export async function getGlobalBrandKeys(brandKeys: string[]): Promise<Set<string>> {
  if (brandKeys.length === 0) return new Set();

  const { data, error } = await db
    .from("sizing_coverage")
    .select("brand_key")
    .eq("brand_type", "global")
    .in("brand_key", brandKeys);

  if (error) {
    console.error("[db/sizing-coverage getGlobalBrandKeys]", error);
    return new Set();
  }

  return new Set(((data as Array<Record<string, unknown>>) ?? []).map((row) => row.brand_key as string));
}

/**
 * Applies a classification to every row of a brand in one statement.
 *
 * Per brand rather than per row because that is how the model is asked: one decision per distinct
 * brand string, applied deterministically to all of its categories. A brand with 50 categories costs
 * one classification, not 50.
 */
export async function setBrandType(connectionId: string, brandKey: string, brandType: BrandType): Promise<boolean> {
  const { error } = await db
    .from("sizing_coverage")
    .update({ brand_type: brandType, updated_at: new Date().toISOString() })
    .eq("connection_id", connectionId)
    .eq("brand_key", brandKey);

  if (error) {
    console.error("[db/sizing-coverage setBrandType]", connectionId, brandKey, error);
    return false;
  }

  return true;
}

/**
 * Puts research outcomes back to `pending` so a re-run treats those rows as unanswered.
 *
 * Needed because every other reader treats a recorded outcome as settled: a row marked `not_found`
 * shows the merchant a hand-fill gap rather than a brand still worth searching for. Without this, a
 * re-run after fixing extraction would repeat the previous verdict on every row it did not manage
 * to change.
 *
 * Scoped to a brand list, or the whole connection when none is given, so a merchant can retry one
 * stubborn brand without discarding what the rest of the pass already established.
 */
export async function resetResearchOutcomes(connectionId: string, brandKeys?: string[]): Promise<boolean> {
  if (brandKeys && brandKeys.length === 0) return true;

  let query = db
    .from("sizing_coverage")
    .update({ research_status: "pending", research_note: null, updated_at: new Date().toISOString() })
    .eq("connection_id", connectionId);

  if (brandKeys) query = query.in("brand_key", brandKeys);

  const { error } = await query;
  if (error) {
    console.error("[db/sizing-coverage resetResearchOutcomes]", connectionId, error);
    return false;
  }

  return true;
}

/**
 * Records what research concluded about specific categories of one brand.
 *
 * Scoped to a category list rather than the whole brand, because one brand's outcome is genuinely
 * per category: a guide can cover men's tops and say nothing about boys' hats, and marking the
 * whole brand `not_covered` would erase the chart it did produce. It also keeps a re-run from
 * overwriting categories that were already resolved on an earlier pass.
 */
export async function setResearchOutcomes(
  connectionId: string,
  brandKey: string,
  sizingCategories: string[],
  status: ResearchStatus,
  note: string | null = null
): Promise<boolean> {
  if (sizingCategories.length === 0) return true;

  const { error } = await db
    .from("sizing_coverage")
    .update({ research_status: status, research_note: note, updated_at: new Date().toISOString() })
    .eq("connection_id", connectionId)
    .eq("brand_key", brandKey)
    .in("sizing_category", sizingCategories);

  if (error) {
    console.error("[db/sizing-coverage setResearchOutcomes]", connectionId, brandKey, status, error);
    return false;
  }

  return true;
}
