import { db } from "@/lib/supabase/server";

export interface SizingProductRecordInput {
  externalId: string;
  sku: string | null;
  title: string;
  brandKey: string;
  sizingCategory: string;
}

export interface SizingProductRecordRow extends SizingProductRecordInput {
  id: string;
  connectionId: string;
}

const INSERT_CHUNK = 500;

/**
 * Replaces the compact product snapshot behind Stage 2.
 *
 * One row per external id is enforced both here and by the database. Products reached through two
 * Woo category-query chunks therefore appear once, and Main-category-only products never arrive:
 * the scan passes only rows resolved to one of the five sizing families.
 */
export async function replaceSizingProductRecords(
  connectionId: string,
  records: SizingProductRecordInput[]
): Promise<boolean> {
  const unique = new Map<string, SizingProductRecordInput>();
  for (const record of records) if (!unique.has(record.externalId)) unique.set(record.externalId, record);

  const { error: deleteError } = await db
    .from("sizing_product_records")
    .delete()
    .eq("connection_id", connectionId);
  if (deleteError) {
    console.error("[db/sizing-product-records replace delete]", connectionId, deleteError);
    return false;
  }

  const rows = [...unique.values()];
  for (let index = 0; index < rows.length; index += INSERT_CHUNK) {
    const payload = rows.slice(index, index + INSERT_CHUNK).map((record) => ({
      connection_id: connectionId,
      external_id: record.externalId,
      sku: record.sku,
      title: record.title,
      brand_key: record.brandKey,
      sizing_category: record.sizingCategory,
    }));
    const { error } = await db.from("sizing_product_records").insert(payload);
    if (error) {
      console.error("[db/sizing-product-records replace insert]", connectionId, error);
      return false;
    }
  }

  return true;
}

function rowToProduct(row: Record<string, unknown>): SizingProductRecordRow {
  return {
    id: row.id as string,
    connectionId: row.connection_id as string,
    externalId: row.external_id as string,
    sku: (row.sku as string | null) ?? null,
    title: row.title as string,
    brandKey: (row.brand_key as string) ?? "",
    sizingCategory: row.sizing_category as string,
  };
}

/** Protects PostgREST's comma-separated `or` syntax and prevents user wildcards widening a search. */
function forOrFilter(search: string): string {
  return search.replace(/[,().*%\\"']/g, " ").trim();
}

/**
 * Returns one exact, stable Stage 2 page.
 *
 * Filtering happens before the database range, so 100 means 100 rows whenever that many matches
 * remain. This replaces the old live-catalog hunt, where a twelve-request safety ceiling could
 * return 17 rows despite a page size of 100.
 */
export async function listSizingProductRecordsPage(
  connectionId: string,
  options: {
    limit: number;
    offset: number;
    brandKeys?: string[] | null;
    sizingCategory?: string | null;
    search?: string | null;
  }
): Promise<{ records: SizingProductRecordRow[]; total: number }> {
  if (options.brandKeys && options.brandKeys.length === 0) return { records: [], total: 0 };

  let query = db
    .from("sizing_product_records")
    .select("id, connection_id, external_id, sku, title, brand_key, sizing_category", { count: "exact" })
    .eq("connection_id", connectionId);

  // PostgREST's `in` grammar does not reliably preserve an empty-string member (`in.("")`), and
  // the empty string is our intentional No-brand sentinel. A single-key filter is also simpler as
  // equality, and makes the Null / no brand chip return its indexed products.
  if (options.brandKeys?.length === 1) query = query.eq("brand_key", options.brandKeys[0]);
  else if (options.brandKeys) query = query.in("brand_key", options.brandKeys);
  if (options.sizingCategory) query = query.eq("sizing_category", options.sizingCategory);

  const search = options.search ? forOrFilter(options.search) : "";
  if (search) {
    query = query.or(`title.ilike.*${search}*,sku.ilike.*${search}*,brand_key.ilike.*${search}*`);
  }

  const { data, error, count } = await query
    .order("title", { ascending: true })
    .order("external_id", { ascending: true })
    .range(options.offset, options.offset + options.limit - 1);

  if (error) {
    console.error("[db/sizing-product-records listPage]", connectionId, error);
    return { records: [], total: 0 };
  }

  return {
    records: ((data as Array<Record<string, unknown>>) ?? []).map(rowToProduct),
    total: count ?? 0,
  };
}
