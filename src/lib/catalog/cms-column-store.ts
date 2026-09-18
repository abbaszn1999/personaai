/**
 * Persistence for a full-catalog CMS column coverage snapshot — the `store_cms_columns` table a
 * completed `discover-cms-columns.ts` walk writes into, and `mapping-options/route.ts` reads back
 * to show real presence/sample numbers instead of a 25-product sample's.
 *
 * Deliberately its own module rather than folded into `db/store-connections.ts`: that file owns
 * one row per connection, this owns a variable number of rows (one per discovered column) that a
 * resumable walk writes incrementally, page by page, and the two shouldn't share one set of
 * conventions for "how a patch is shaped".
 */

import { db } from "@/lib/supabase/server";
import type { CmsColumnGroup, CmsColumnScope, CmsColumnValueType } from "./cms-columns";

export interface PersistedColumnCoverage {
  presence: number;
  sampled: number;
  sample: string | null;
}

export interface CmsColumnUpsert {
  key: string;
  label: string;
  group: CmsColumnGroup;
  scope: CmsColumnScope;
  valueType: CmsColumnValueType;
  sample: string | null;
  presence: number;
  sampled: number;
}

/**
 * The most recent completed (or in-progress) full-catalog walk's own numbers for every column it
 * has seen, keyed the same way `columnKey(ref)` keys everything else in Stage 1.
 *
 * Returns an empty map for a connection that has never run a walk — the caller (`discoverColumns`)
 * already treats that as "fall back to the 25-product sample's own numbers", so there is nothing
 * for this function to distinguish between "never ran" and "ran and found nothing" beyond that.
 */
export async function getPersistedCmsColumns(connectionId: string): Promise<Map<string, PersistedColumnCoverage>> {
  const { data, error } = await db
    .from("store_cms_columns")
    .select("column_key, presence, sampled, sample")
    .eq("connection_id", connectionId);

  if (error) {
    console.error("[cms-column-store getPersistedCmsColumns]", connectionId, error);
    return new Map();
  }

  return new Map(
    (data ?? []).map((row) => [
      row.column_key as string,
      {
        presence: (row.presence as number) ?? 0,
        sampled: (row.sampled as number) ?? 0,
        sample: (row.sample as string | null) ?? null,
      },
    ])
  );
}

/**
 * Folds one page's worth of column evidence into the connection's running snapshot.
 *
 * Read-then-write rather than a single atomic increment: only one walk is ever active per
 * connection (`cms_column_discovery_status` guards that — see `discover-cms-columns.ts`), so there
 * is no concurrent writer for this to race against, and the extra read buys a plain upsert instead
 * of a raw-SQL RPC just to add two integers.
 */
export async function recordCmsColumnPage(connectionId: string, page: readonly CmsColumnUpsert[]): Promise<void> {
  if (page.length === 0) return;

  const keys = page.map((column) => column.key);
  const { data: existingRows, error: readError } = await db
    .from("store_cms_columns")
    .select("column_key, presence, sampled, sample")
    .eq("connection_id", connectionId)
    .in("column_key", keys);

  if (readError) {
    console.error("[cms-column-store recordCmsColumnPage] read", connectionId, readError);
    return;
  }

  const existing = new Map((existingRows ?? []).map((row) => [row.column_key as string, row]));

  const rows = page.map((column) => {
    const prior = existing.get(column.key);
    return {
      connection_id: connectionId,
      column_key: column.key,
      label: column.label,
      group: column.group,
      scope: column.scope,
      value_type: column.valueType,
      sample: column.sample ?? (prior?.sample as string | null) ?? null,
      presence: ((prior?.presence as number) ?? 0) + column.presence,
      sampled: ((prior?.sampled as number) ?? 0) + column.sampled,
      updated_at: new Date().toISOString(),
    };
  });

  const { error: writeError } = await db.from("store_cms_columns").upsert(rows, { onConflict: "connection_id,column_key" });

  if (writeError) {
    console.error("[cms-column-store recordCmsColumnPage] write", connectionId, writeError);
  }
}

/** Clears a connection's snapshot before a fresh walk starts, so a restarted discovery never
 *  double-counts a page it already recorded on a previous, since-abandoned run. */
export async function clearCmsColumns(connectionId: string): Promise<void> {
  const { error } = await db.from("store_cms_columns").delete().eq("connection_id", connectionId);

  if (error) {
    console.error("[cms-column-store clearCmsColumns]", connectionId, error);
  }
}
