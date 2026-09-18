import { db } from "@/lib/supabase/server";
import type { NullRecord } from "@/lib/sizing/aggregate";

/**
 * The doc's `null_records` (Tab 2): products where no brand could be identified.
 *
 * Kept in its own table rather than as a column on coverage because the grain is different —
 * coverage is one row per brand and category, and these rows have no brand to key on. Tab 3 routes
 * them to manual fill grouped by category, which is the only grouping an unbranded row has.
 */

export interface SizingNullRecordRow {
  id: string;
  connectionId: string;
  externalId: string;
  sku: string | null;
  title: string;
  sizingCategory: string;
}

/** Rows per insert. The list can run to thousands, and one statement that large is a timeout
 *  waiting to happen against a slow connection. */
const INSERT_CHUNK = 500;

/**
 * Replaces a store's null records with the scan's findings.
 *
 * Delete-then-insert for the same reason coverage uses it: a re-scan reads the merchant's catalog as
 * it is now, so a product that has since been given a brand in the store admin has to *stop* being
 * listed. Merging would leave it in the gap queue forever, asking for a chart nobody needs.
 */
export async function replaceSizingNullRecords(connectionId: string, records: NullRecord[]): Promise<boolean> {
  const { error: deleteError } = await db.from("sizing_null_records").delete().eq("connection_id", connectionId);
  if (deleteError) {
    console.error("[db/sizing-null-records replace delete]", connectionId, deleteError);
    return false;
  }

  for (let i = 0; i < records.length; i += INSERT_CHUNK) {
    const payload = records.slice(i, i + INSERT_CHUNK).map((record) => ({
      connection_id: connectionId,
      external_id: record.externalId,
      sku: record.sku,
      title: record.title,
      sizing_category: record.sizingCategory,
    }));

    const { error } = await db.from("sizing_null_records").insert(payload);
    if (error) {
      console.error("[db/sizing-null-records replace insert]", connectionId, error);
      return false;
    }
  }

  return true;
}

export async function listSizingNullRecords(connectionId: string): Promise<SizingNullRecordRow[]> {
  const { data, error } = await db
    .from("sizing_null_records")
    .select("id, connection_id, external_id, sku, title, sizing_category")
    .eq("connection_id", connectionId)
    .order("sizing_category", { ascending: true });

  if (error) {
    console.error("[db/sizing-null-records list]", connectionId, error);
    return [];
  }

  return ((data as Array<Record<string, unknown>>) ?? []).map((row) => ({
    id: row.id as string,
    connectionId: row.connection_id as string,
    externalId: row.external_id as string,
    sku: (row.sku as string | null) ?? null,
    title: row.title as string,
    sizingCategory: row.sizing_category as string,
  }));
}

/**
 * Escapes a merchant's search text for a PostgREST `or` filter.
 *
 * The `or` operand is parsed as a comma-separated list, so a comma or a bracket in the text does not
 * fail — it silently becomes a different filter. `*` is PostgREST's own wildcard and `%` is the SQL
 * one underneath, both of which would widen the match. Dropped rather than escaped: none of them
 * belong in a product title search, and the alternative is two round trips to avoid `or` entirely.
 */
function forOrFilter(search: string): string {
  return search.replace(/[,().*%\\"']/g, " ").trim();
}

/**
 * One page of the unbranded list, with the filters Stage 2 offers, and the exact total.
 *
 * The reason this exists rather than the preview finding these by walking the store: unbranded stock
 * is sparse and clustered. On one catalog 33 of the 34 unbranded products sat in a single category
 * that happened to be the last group the walk visits, so a filtered page reported "1 of 34" and the
 * merchant had to keep pressing Next to reach the rest. This bucket is the only one with a row-level
 * index — the other brand types are aggregates with no product ids — so it is the only one that can
 * be answered exactly, and it is also the one that matters most, being the manual-fill queue.
 *
 * Holds only *sized* unbranded stock, because that is all the scan records. Which is exactly right
 * here: the chip beside it counts the same thing, so the two agree by construction.
 */
export async function listSizingNullRecordsPage(
  connectionId: string,
  options: { limit: number; offset: number; sizingCategory?: string | null; search?: string | null }
): Promise<{ records: SizingNullRecordRow[]; total: number }> {
  let query = db
    .from("sizing_null_records")
    .select("id, connection_id, external_id, sku, title, sizing_category", { count: "exact" })
    .eq("connection_id", connectionId);

  if (options.sizingCategory) query = query.eq("sizing_category", options.sizingCategory);

  const search = options.search ? forOrFilter(options.search) : "";
  if (search) query = query.or(`title.ilike.*${search}*,sku.ilike.*${search}*`);

  // Ordered by id as well, because `sizing_category` alone is not a total order — two pages of an
  // unstable sort can repeat a row and skip another.
  const { data, error, count } = await query
    .order("sizing_category", { ascending: true })
    .order("id", { ascending: true })
    .range(options.offset, options.offset + options.limit - 1);

  if (error) {
    console.error("[db/sizing-null-records listPage]", connectionId, error);
    return { records: [], total: 0 };
  }

  return {
    records: ((data as Array<Record<string, unknown>>) ?? []).map((row) => ({
      id: row.id as string,
      connectionId: row.connection_id as string,
      externalId: row.external_id as string,
      sku: (row.sku as string | null) ?? null,
      title: row.title as string,
      sizingCategory: row.sizing_category as string,
    })),
    total: count ?? 0,
  };
}

/** How many unbranded products sit under each sizing category — Tab 3's grouping, without pulling
 *  the whole list back to count it. */
export async function countNullRecordsByCategory(connectionId: string): Promise<Record<string, number>> {
  const { data, error } = await db
    .from("sizing_null_records")
    .select("sizing_category")
    .eq("connection_id", connectionId);

  if (error) {
    console.error("[db/sizing-null-records countByCategory]", connectionId, error);
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of (data as Array<Record<string, unknown>>) ?? []) {
    const key = row.sizing_category as string;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
