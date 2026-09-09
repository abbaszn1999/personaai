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
