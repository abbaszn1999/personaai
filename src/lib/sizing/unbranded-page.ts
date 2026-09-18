import type { RawCatalogProduct } from "@/lib/catalog/sync-types";
import type { SizingNullRecordRow } from "@/lib/db/sizing-null-records";

/** What the index was asked for, and what came back. */
export interface UnbrandedIndexQuery {
  limit: number;
  offset: number;
  sizingCategory?: string | null;
  search?: string | null;
}

export interface UnbrandedPage<Row> {
  rows: Row[];
  nextCursor: string | null;
  /** Exact, from the index, so the footer can say "of 34" rather than "searched so far". */
  total: number;
}

/**
 * A page of unbranded stock, looked up rather than searched for.
 *
 * Unbranded products are the one brand bucket recorded product by product — the others are aggregates
 * with no ids in them — so this is the only one that can be answered exactly instead of by walking the
 * merchant's catalog hoping to run into its members. Which matters because they cluster: on one real
 * store 33 of the 34 unbranded products sat in a single category, and that category happened to be
 * the last group the catalog walk visits, so a filtered page truthfully reported "1 of 34" and the
 * other 33 were several Next presses away. Two round trips answer it outright.
 *
 * The index supplies identity and order; the store supplies everything shown. Rows are not served
 * from the index alone even though it holds the title and SKU, because then unbranded rows would be
 * the only ones on the screen showing a stale price, no image and no sizes.
 *
 * `readIndex` is injected for the same reason `walkPagedCatalog` takes `fetchPage`: the ordering and
 * cursor arithmetic here is the part worth testing, and it should not need a database to exercise.
 */
export async function pageUnbrandedProducts<Row>(options: {
  readIndex(query: UnbrandedIndexQuery): Promise<{ records: SizingNullRecordRow[]; total: number }>;
  fetchByIds(externalIds: readonly string[]): Promise<RawCatalogProduct[]>;
  map(raw: RawCatalogProduct): Row;
  /** A plain offset into the index. Never the catalog walk's three-part position — switching filters
   *  resets the client's cursor history — and anything unparseable restarts at the top. */
  cursor: string | null;
  pageSize: number;
  parent?: string | null;
  search?: string | null;
}): Promise<UnbrandedPage<Row>> {
  const parsed = Number(options.cursor);
  const offset = Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;

  const { records, total } = await options.readIndex({
    limit: options.pageSize,
    offset,
    sizingCategory: options.parent ?? null,
    search: options.search || null,
  });

  const raws = await options.fetchByIds(records.map((record) => record.externalId));

  // Put back into the index's order, which is the one the offsets count in. Neither platform promises
  // to return an id list in the order it was given, and paging an order other than the one being
  // offset into shows some products twice and never shows others.
  const byId = new Map(raws.map((raw) => [raw.externalId, raw]));
  const rows = records
    // A product deleted from the store since the scan resolves to nothing and drops off the list,
    // which is the right outcome — it is no longer stock anyone has to fill a chart for.
    .flatMap((record) => {
      const raw = byId.get(record.externalId);
      return raw ? [options.map(raw)] : [];
    });

  // Counted from what the index returned, not from what the store still has, so a deleted product
  // costs a shorter page rather than an offset that stalls and repeats the same page forever.
  const consumed = offset + records.length;

  return { rows, nextCursor: consumed < total ? String(consumed) : null, total };
}
