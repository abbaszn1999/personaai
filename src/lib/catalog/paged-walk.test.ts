import { describe, expect, it } from "vitest";
import { encodeWalkCursor, parseWalkCursor, walkPagedCatalog } from "./paged-walk";

interface Item {
  id: number;
  kind: "hit" | "miss";
}

/**
 * A pager over fixed pages, so a walk's position arithmetic can be checked without a store.
 *
 * `groups` is a list of groups, each a list of pages. Cursors are page indexes as strings, which is
 * exactly WooCommerce's own shape and close enough to Shopify's opaque token for the walk, since it
 * never interprets them.
 */
function fakePager(groups: Item[][][]) {
  const requests: Array<{ group: string; cursor: string | null }> = [];

  return {
    requests,
    groups: groups.map((_, index) => [`g${index}`]),
    fetchPage: async (group: readonly string[], cursor: string | null) => {
      requests.push({ group: group[0], cursor });

      const groupIndex = Number(group[0].slice(1));
      const pageIndex = cursor ? Number(cursor) : 0;
      const pages = groups[groupIndex];

      return {
        products: pages[pageIndex] ?? [],
        nextCursor: pageIndex + 1 < pages.length ? String(pageIndex + 1) : null,
      };
    },
  };
}

const identity = (item: Item) => item;
const isHit = (item: Item) => item.kind === "hit";

function hits(count: number, from = 0): Item[] {
  return Array.from({ length: count }, (_, i) => ({ id: from + i, kind: "hit" as const }));
}

function misses(count: number, from = 100): Item[] {
  return Array.from({ length: count }, (_, i) => ({ id: from + i, kind: "miss" as const }));
}

describe("parseWalkCursor", () => {
  it("starts at the beginning for an absent cursor", () => {
    expect(parseWalkCursor(null)).toEqual({ groupIndex: 0, skip: 0, inner: null });
    expect(parseWalkCursor(undefined)).toEqual({ groupIndex: 0, skip: 0, inner: null });
    expect(parseWalkCursor("")).toEqual({ groupIndex: 0, skip: 0, inner: null });
  });

  it("round-trips a position", () => {
    const position = { groupIndex: 3, skip: 7, inner: "eyJsYXN0X2lkIjoxfQ==" };
    expect(parseWalkCursor(encodeWalkCursor(position))).toEqual(position);
  });

  it("round-trips a position with no inner cursor", () => {
    const position = { groupIndex: 2, skip: 0, inner: null };
    expect(parseWalkCursor(encodeWalkCursor(position))).toEqual(position);
  });

  it("keeps an inner cursor containing the separator", () => {
    // Base64 can't produce a pipe, but the walk never inspects the token, so a platform that did
    // would still have to survive a round trip rather than truncate.
    expect(parseWalkCursor("1|2|a|b").inner).toBe("a|b");
  });

  it("restarts rather than throwing on a malformed cursor", () => {
    // A stale token outliving a deploy should show page one, not an error.
    expect(parseWalkCursor("garbage")).toEqual({ groupIndex: 0, skip: 0, inner: null });
    expect(parseWalkCursor("1|")).toEqual({ groupIndex: 0, skip: 0, inner: null });
    expect(parseWalkCursor("x|y|z")).toEqual({ groupIndex: 0, skip: 0, inner: "z" });
    expect(parseWalkCursor("-1|-4|z")).toEqual({ groupIndex: 0, skip: 0, inner: "z" });
  });
});

describe("walkPagedCatalog", () => {
  it("reads a single page when unfiltered and the page fills the request", async () => {
    const pager = fakePager([[hits(25), hits(25, 25)]]);

    const result = await walkPagedCatalog({ ...pager, pageSize: 25, maxHops: 12, map: identity });

    expect(result.rows).toHaveLength(25);
    expect(result.hops).toBe(1);
    expect(result.nextCursor).not.toBeNull();
  });

  it("returns null nextCursor at the end of the catalog", async () => {
    const pager = fakePager([[hits(10)]]);

    const result = await walkPagedCatalog({ ...pager, pageSize: 25, maxHops: 12, map: identity });

    expect(result.rows).toHaveLength(10);
    expect(result.nextCursor).toBeNull();
  });

  it("crosses group boundaries so a selection walks as one sequence", async () => {
    const pager = fakePager([[hits(2)], [hits(2, 10)], [hits(2, 20)]]);

    const result = await walkPagedCatalog({ ...pager, pageSize: 25, maxHops: 12, map: identity });

    expect(result.rows.map((row) => row.id)).toEqual([0, 1, 10, 11, 20, 21]);
    expect(result.nextCursor).toBeNull();
  });

  it("skips empty groups rather than returning a blank page with a live cursor", async () => {
    const pager = fakePager([[[]], [[]], [hits(3)]]);

    const result = await walkPagedCatalog({ ...pager, pageSize: 25, maxHops: 12, map: identity });

    expect(result.rows).toHaveLength(3);
    expect(result.hops).toBe(3);
  });

  it("gathers sparse matches across several pages to fill one response", async () => {
    const pager = fakePager([[
      [...misses(9), ...hits(1, 0)],
      [...misses(9, 200), ...hits(1, 1)],
      [...misses(9, 300), ...hits(1, 2)],
    ]]);

    const result = await walkPagedCatalog({
      ...pager,
      pageSize: 3,
      maxHops: 12,
      map: identity,
      match: isHit,
    });

    expect(result.rows.map((row) => row.id)).toEqual([0, 1, 2]);
    expect(result.hops).toBe(3);
  });

  it("resumes mid-page when one page holds more matches than fit", async () => {
    const pager = fakePager([[hits(10)]]);
    const options = { ...pager, pageSize: 4, maxHops: 12, map: identity, match: isHit };

    const first = await walkPagedCatalog(options);
    expect(first.rows.map((row) => row.id)).toEqual([0, 1, 2, 3]);
    expect(parseWalkCursor(first.nextCursor).skip).toBe(4);

    const second = await walkPagedCatalog({ ...options, cursor: first.nextCursor });
    expect(second.rows.map((row) => row.id)).toEqual([4, 5, 6, 7]);

    const third = await walkPagedCatalog({ ...options, cursor: second.nextCursor });
    expect(third.rows.map((row) => row.id)).toEqual([8, 9]);
    expect(third.nextCursor).toBeNull();
  });

  it("returns every match exactly once when paged all the way through", async () => {
    // The property that actually matters: a filtered walk must neither drop nor repeat a product,
    // whatever the page boundaries happen to fall on.
    const pager = fakePager([
      [[...hits(3), ...misses(2)], [...misses(4), ...hits(2, 3)]],
      [[...hits(4, 5), ...misses(1)]],
    ]);

    const options = { ...pager, pageSize: 2, maxHops: 12, map: identity, match: isHit };
    const seen: number[] = [];
    let cursor: string | null = null;

    for (let guard = 0; guard < 20; guard += 1) {
      const page: Awaited<ReturnType<typeof walkPagedCatalog<Item, Item>>> = await walkPagedCatalog({
        ...options,
        cursor,
      });
      seen.push(...page.rows.map((row) => row.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }

    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("stops at the hop ceiling but hands back somewhere to resume", async () => {
    const pager = fakePager([[misses(5), misses(5, 200), misses(5, 300), hits(1, 42)]]);

    const result = await walkPagedCatalog({
      ...pager,
      pageSize: 5,
      maxHops: 2,
      map: identity,
      match: isHit,
    });

    expect(result.rows).toHaveLength(0);
    expect(result.hops).toBe(2);
    // The match sits beyond the budget; reporting the catalog as finished here would lose it.
    expect(result.nextCursor).not.toBeNull();

    const resumed = await walkPagedCatalog({
      ...pager,
      pageSize: 5,
      maxHops: 5,
      map: identity,
      match: isHit,
      cursor: result.nextCursor,
    });

    expect(resumed.rows.map((row) => row.id)).toEqual([42]);
  });

  it("does not re-read pages it already walked past when resuming", async () => {
    const pager = fakePager([[hits(2), hits(2, 10)]]);
    const options = { ...pager, pageSize: 2, maxHops: 12, map: identity, match: isHit };

    const first = await walkPagedCatalog(options);
    pager.requests.length = 0;

    await walkPagedCatalog({ ...options, cursor: first.nextCursor });

    expect(pager.requests).toEqual([{ group: "g0", cursor: "1" }]);
  });
});
