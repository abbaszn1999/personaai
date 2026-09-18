import { db } from "@/lib/supabase/server";

/**
 * What the store carries per (brand x merchant category path x sizing parent), as counts only.
 *
 * The grouping Stage 5 assigns against. `sizing_coverage` knows only the sizing parent, which cannot
 * tell `Men > T-Shirts` from `Women > Tops` — both are "tops" — and those two paths legitimately
 * want different chart variants from the same brand. This table is that missing axis.
 *
 * Aggregate, deliberately: no SKUs, ids, prices or images. Keeping the merchant's catalog out of our
 * database is the architectural bet the whole pipeline rests on, and a count per path is everything
 * an assignment screen can act on.
 */
export interface SizingPathCoverageInput {
  brandKey: string;
  brandName: string | null;
  /** The platform's own stable term id for the deepest mapped category the products sit on. Stable
   *  across renames, which is what lets an assignment survive a merchant tidying their taxonomy. */
  categoryId: string;
  /** Breadcrumb for display, refreshed by every scan. Never keyed on. */
  categoryPath: string[];
  sizingCategory: string;
  skuCount: number;
}

export interface SizingPathCoverageRow extends SizingPathCoverageInput {
  id: string;
  connectionId: string;
}

const INSERT_CHUNK = 500;

function rowToPathCoverage(row: Record<string, unknown>): SizingPathCoverageRow {
  return {
    id: row.id as string,
    connectionId: row.connection_id as string,
    brandKey: (row.brand_key as string) ?? "",
    brandName: (row.brand_name as string | null) ?? null,
    categoryId: row.category_id as string,
    categoryPath: Array.isArray(row.category_path)
      ? (row.category_path as unknown[]).filter((part): part is string => typeof part === "string")
      : [],
    sizingCategory: row.sizing_category as string,
    skuCount: (row.sku_count as number) ?? 0,
  };
}

/**
 * Replaces this connection's path coverage with the scan's own aggregate.
 *
 * Wholesale rather than incremental, for the same reason `replaceSizingCoverage` is: a path the
 * merchant stopped selling has to disappear, and merging would leave it on the assignment screen
 * forever with a count nothing can ever bring down to zero.
 */
export async function replaceSizingPathCoverage(
  connectionId: string,
  rows: SizingPathCoverageInput[]
): Promise<boolean> {
  const { error: deleteError } = await db
    .from("sizing_path_coverage")
    .delete()
    .eq("connection_id", connectionId);
  if (deleteError) {
    console.error("[db/sizing-path-coverage replace delete]", connectionId, deleteError);
    return false;
  }

  for (let index = 0; index < rows.length; index += INSERT_CHUNK) {
    const payload = rows.slice(index, index + INSERT_CHUNK).map((row) => ({
      connection_id: connectionId,
      brand_key: row.brandKey,
      brand_name: row.brandName,
      category_id: row.categoryId,
      category_path: row.categoryPath,
      sizing_category: row.sizingCategory,
      sku_count: row.skuCount,
    }));
    const { error } = await db.from("sizing_path_coverage").insert(payload);
    if (error) {
      console.error("[db/sizing-path-coverage replace insert]", connectionId, error);
      return false;
    }
  }

  return true;
}

export async function listSizingPathCoverage(connectionId: string): Promise<SizingPathCoverageRow[]> {
  const { data, error } = await db
    .from("sizing_path_coverage")
    .select("*")
    .eq("connection_id", connectionId)
    .order("sku_count", { ascending: false });

  if (error) {
    console.error("[db/sizing-path-coverage list]", connectionId, error);
    return [];
  }

  return ((data as Array<Record<string, unknown>>) ?? []).map(rowToPathCoverage);
}
