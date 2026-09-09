/**
 * Walks a catalog pager until it has filled a page of matching rows.
 *
 * Split out from the preview route so the position arithmetic is testable on its own. It is worth
 * that on its own merits: a filtered walk that miscounts does not throw or look broken, it quietly
 * omits products, and "the size column is wrong for some of my catalog" is exactly the kind of
 * report this stage exists to prevent rather than cause.
 *
 * Unfiltered this is a single fetch — the store page size and the response page size are the same
 * number, so the first page fills it. The machinery only earns its keep under a filter, where
 * matches are sparse and a response has to span several store pages.
 */

/** Where a walk resumes.
 *
 * Three parts because there are three levels of position. A pager holds a list of category groups
 * and each group pages independently — Shopify can only descend from one collection at a time, so
 * its groups are collections, while Woo filters on a union and has a single chunked group. `skip`
 * is the third and the reason this isn't just a cursor: with a filter active a single store page can
 * hold more matches than fit in one response, so a page has to be resumable partway through rather
 * than stepping past the remainder.
 */
export interface WalkPosition {
  groupIndex: number;
  /** Matches already returned from the page `inner` fetches, so a resumed page doesn't repeat them. */
  skip: number;
  inner: string | null;
}

const START: WalkPosition = { groupIndex: 0, skip: 0, inner: null };

/**
 * Reads a walk position back from its wire form.
 *
 * Anything unparseable restarts from the beginning rather than throwing. A cursor is a client-held
 * token that can outlive a deploy or a changed selection, and showing a merchant page one is a far
 * better answer to a stale one than an error page.
 *
 * `|` is the separator because Shopify's cursors are base64, whose alphabet cannot contain it, and
 * `inner` goes last so a cursor holding anything at all still parses.
 */
export function parseWalkCursor(raw: string | null | undefined): WalkPosition {
  if (!raw) return START;

  const first = raw.indexOf("|");
  if (first === -1) return START;
  const second = raw.indexOf("|", first + 1);
  if (second === -1) return START;

  const groupIndex = Number(raw.slice(0, first));
  const skip = Number(raw.slice(first + 1, second));

  return {
    groupIndex: Number.isInteger(groupIndex) && groupIndex >= 0 ? groupIndex : 0,
    skip: Number.isInteger(skip) && skip >= 0 ? skip : 0,
    inner: raw.slice(second + 1) || null,
  };
}

export function encodeWalkCursor(position: WalkPosition): string {
  return `${position.groupIndex}|${position.skip}|${position.inner ?? ""}`;
}

export interface PagedWalkOptions<Raw, Row> {
  groups: readonly (readonly string[])[];
  fetchPage(
    group: readonly string[],
    cursor: string | null
  ): Promise<{ products: Raw[]; nextCursor: string | null }>;
  /** Where to resume, in wire form. Absent starts at the beginning. */
  cursor?: string | null;
  /** How many matching rows to return at most. */
  pageSize: number;
  /** Ceiling on store pages read in one walk, so a selective filter can't turn one click into a
   *  full catalog traversal against a merchant's live store. */
  maxHops: number;
  map(raw: Raw): Row;
  match?(row: Row): boolean;
}

export interface PagedWalkResult<Row> {
  rows: Row[];
  /** Null only when the catalog is genuinely exhausted. Set even when the hop budget ran out with
   *  nothing found, because there is still more to look through. */
  nextCursor: string | null;
  /** Store pages actually read. Exposed for tests and logging, not for display. */
  hops: number;
}

export async function walkPagedCatalog<Raw, Row>(
  options: PagedWalkOptions<Raw, Row>
): Promise<PagedWalkResult<Row>> {
  const { groups, fetchPage, pageSize, maxHops, map, match } = options;

  /** Start of the page after the one `from` fetched, or null at the end of the catalog. */
  const advance = (from: WalkPosition, pageCursor: string | null): WalkPosition | null => {
    if (pageCursor) return { groupIndex: from.groupIndex, skip: 0, inner: pageCursor };
    if (from.groupIndex + 1 < groups.length) return { groupIndex: from.groupIndex + 1, skip: 0, inner: null };
    return null;
  };

  let position: WalkPosition | null = parseWalkCursor(options.cursor);
  const rows: Row[] = [];
  let nextCursor: string | null = null;
  let hops = 0;

  while (position && rows.length < pageSize && hops < maxHops) {
    // Pinned so reassigning `position` at the bottom doesn't make its own inputs circular.
    const current: WalkPosition = position;
    if (current.groupIndex >= groups.length) break;

    const page = await fetchPage(groups[current.groupIndex], current.inner);
    hops += 1;

    const found = match ? page.products.map(map).filter(match) : page.products.map(map);
    const taken = found.slice(current.skip, current.skip + (pageSize - rows.length));
    rows.push(...taken);

    const consumed: number = current.skip + taken.length;
    const next: WalkPosition | null =
      // More matches left on this same page than fit in the response — resume here rather than
      // stepping past them, which is how a filtered walk silently loses rows.
      consumed < found.length ? { ...current, skip: consumed } : advance(current, page.nextCursor);

    // Reassigned every hop, so exhausting the hop budget still hands back somewhere to resume.
    // Dropping it would report a catalog with more in it as finished.
    nextCursor = next ? encodeWalkCursor(next) : null;

    if (rows.length >= pageSize) break;
    position = next;
  }

  return { rows, nextCursor, hops };
}
