import { db } from "@/lib/supabase/server";

/**
 * Which discovered chart variant governs a merchant category path — doc Part 7's Chart Assignment.
 *
 * Keyed identically to `sizing_path_coverage` so the join is exact, but a separate table because the
 * two have opposite lifecycles: coverage is replaced wholesale by every scan, an assignment is a
 * merchant decision that has to survive one.
 *
 * `variantName` rather than a chart id, and that is the load-bearing choice here. `upsertChart`
 * deletes and re-inserts each published table it writes, so a re-run of research mints new chart uuids
 * for the same guide — and a uuid stored here would dangle the moment a merchant re-researched the
 * brand they had just finished assigning. The variant name is what the brand publishes, what
 * `sizing_charts` is itself keyed on, and what survives a re-extraction of the same page.
 */
export type AssignmentSource = "merchant" | "auto";

export interface SizingChartAssignmentRow {
  id: string;
  connectionId: string;
  brandKey: string;
  categoryId: string;
  sizingCategory: string;
  /** Null is an answer, not an absence: the merchant looked at this path and chose no chart. A path
   *  nobody has decided on has no row at all. */
  variantName: string | null;
  source: AssignmentSource;
}

export interface SizingChartAssignmentInput {
  connectionId: string;
  brandKey: string;
  categoryId: string;
  sizingCategory: string;
  variantName: string | null;
  source: AssignmentSource;
}

function rowToAssignment(row: Record<string, unknown>): SizingChartAssignmentRow {
  return {
    id: row.id as string,
    connectionId: row.connection_id as string,
    brandKey: (row.brand_key as string) ?? "",
    categoryId: row.category_id as string,
    sizingCategory: row.sizing_category as string,
    variantName: (row.variant_name as string | null) ?? null,
    source: row.source === "auto" ? "auto" : "merchant",
  };
}

export async function listSizingChartAssignments(connectionId: string): Promise<SizingChartAssignmentRow[]> {
  const { data, error } = await db
    .from("sizing_chart_assignments")
    .select("*")
    .eq("connection_id", connectionId);

  if (error) {
    console.error("[db/sizing-chart-assignments list]", connectionId, error);
    return [];
  }

  return ((data as Array<Record<string, unknown>>) ?? []).map(rowToAssignment);
}

/** Records one path's chart, replacing whatever it held. Upsert on the natural key so a merchant
 *  changing their mind does not accumulate a second row the join would then have to choose between. */
export async function upsertSizingChartAssignment(input: SizingChartAssignmentInput): Promise<boolean> {
  const { error } = await db.from("sizing_chart_assignments").upsert(
    {
      connection_id: input.connectionId,
      brand_key: input.brandKey,
      category_id: input.categoryId,
      sizing_category: input.sizingCategory,
      variant_name: input.variantName,
      source: input.source,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_id,brand_key,category_id,sizing_category" }
  );

  if (error) {
    console.error("[db/sizing-chart-assignments upsert]", input.connectionId, error);
    return false;
  }

  return true;
}

/** Writes several auto-matched rows at once, for the pass that resolves the unambiguous cases. */
export async function insertAutoAssignments(rows: SizingChartAssignmentInput[]): Promise<boolean> {
  if (rows.length === 0) return true;

  const { error } = await db.from("sizing_chart_assignments").upsert(
    rows.map((row) => ({
      connection_id: row.connectionId,
      brand_key: row.brandKey,
      category_id: row.categoryId,
      sizing_category: row.sizingCategory,
      variant_name: row.variantName,
      source: row.source,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "connection_id,brand_key,category_id,sizing_category" }
  );

  if (error) {
    console.error("[db/sizing-chart-assignments insertAuto]", error);
    return false;
  }

  return true;
}

/**
 * Drops assignments for paths this store no longer carries.
 *
 * Called after a rescan replaces path coverage. Without it a merchant who stopped selling a category
 * keeps its assignment forever — invisible, since the screen joins from coverage, but counted by
 * anything that reads the table directly.
 */
export async function deleteSizingChartAssignments(connectionId: string, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;

  const { error } = await db
    .from("sizing_chart_assignments")
    .delete()
    .eq("connection_id", connectionId)
    .in("id", ids);

  if (error) {
    console.error("[db/sizing-chart-assignments delete]", connectionId, error);
    return false;
  }

  return true;
}
