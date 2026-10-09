import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AcsProduct } from "./types";

type Op = [method: string, ...args: unknown[]];
interface Call {
  table: string;
  ops: Op[];
}
type Answer = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number | null };

const calls: Call[] = [];
let answer: (call: Call) => Answer = () => ({ data: null, error: null });

function chain(call: Call): unknown {
  const target = {
    then(resolve: (value: Answer) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve(answer(call)).then(resolve, reject);
    },
  };
  return new Proxy(target, {
    get(object, property) {
      if (property === "then") return object.then;
      return (...args: unknown[]) => {
        call.ops.push([String(property), ...args]);
        return chain(call);
      };
    },
  });
}

vi.mock("@/lib/supabase/server", () => ({
  db: {
    from: (table: string) => {
      const call: Call = { table, ops: [] };
      calls.push(call);
      return chain(call);
    },
    rpc: (name: string, args: unknown) => {
      const call: Call = { table: `rpc:${name}`, ops: [["rpc", args]] };
      calls.push(call);
      return chain(call);
    },
  },
}));

// A fresh module per test: a "tables missing" answer switches the mirror off for a while, and that
// must not leak into the next test.
let mirror: typeof import("./mirror");
const connectionIdFromAcsId = (id: string) => mirror.connectionIdFromAcsId(id);
const mirrorImported = (...args: Parameters<typeof mirror.mirrorImported>) => mirror.mirrorImported(...args);
const readMirrorPage = (...args: Parameters<typeof mirror.readMirrorPage>) => mirror.readMirrorPage(...args);
const readMirrorDocuments = (...args: Parameters<typeof mirror.readMirrorDocuments>) => mirror.readMirrorDocuments(...args);
const listStaleMirrorIds = (...args: Parameters<typeof mirror.listStaleMirrorIds>) => mirror.listStaleMirrorIds(...args);
const mirrorAvailability = (...args: Parameters<typeof mirror.mirrorAvailability>) => mirror.mirrorAvailability(...args);
const reconcileMirror = (...args: Parameters<typeof mirror.reconcileMirror>) => mirror.reconcileMirror(...args);

const STORE = "dab4cb95-d31a-4f56-8e8e-499ccf6d7d96";

function product(id: string, overrides: Partial<AcsProduct> = {}): AcsProduct {
  return {
    id: `${STORE}_${id}`,
    title: `Product ${id}`,
    categories: ["persona > women > top > t-shirt"],
    availability: "IN_STOCK",
    brands: ["Tom Tailor"],
    attributes: { merchant_id: { text: [STORE] } },
    ...overrides,
  } as AcsProduct;
}

const opsOf = (table: string, method: string) =>
  calls.filter((call) => call.table === table).flatMap((call) => call.ops.filter((op) => op[0] === method));

beforeEach(async () => {
  calls.length = 0;
  answer = () => ({ data: null, error: null });
  vi.resetModules();
  mirror = await import("./mirror");
});

describe("mirror identity", () => {
  it("reads the store from the connection-prefixed document id", () => {
    expect(connectionIdFromAcsId(`${STORE}_gid://shopify/Product/1::gid://shopify/ProductVariant/2`)).toBe(STORE);
    expect(connectionIdFromAcsId("not-a-store_123")).toBeNull();
  });
});

describe("readMirrorPage", () => {
  it("refuses to answer for a store whose mirror was never reconciled", async () => {
    answer = (call) => (call.table === "acs_catalog_mirror_state" ? { data: { complete_at: null } } : { data: [] });

    expect(await readMirrorPage(STORE, { offset: 0, limit: 25 })).toBeNull();
    expect(calls.some((call) => call.table === "acs_catalog_mirror")).toBe(false);
  });

  it("pages one store in parent-then-variant order, with live availability and whole-store counts", async () => {
    const stored = { id: `${STORE}_1`, type: "PRIMARY", brand: "Tom Tailor", availability: "IN_STOCK" };
    answer = (call) => {
      if (call.table === "acs_catalog_mirror_state") return { data: { complete_at: "2026-10-07T10:00:00.000Z" } };
      if (call.table === "rpc:acs_catalog_mirror_counts") {
        return {
          data: [
            { product_type: "PRIMARY", availability: "IN_STOCK", total: 3 },
            { product_type: "VARIANT", availability: "OUT_OF_STOCK", total: "2" },
          ],
        };
      }
      return { data: [{ record: stored, availability: "OUT_OF_STOCK" }], count: 41 };
    };

    const page = await readMirrorPage(STORE, {
      offset: 25,
      limit: 25,
      query: "Tee_50%",
      type: "PRIMARY",
      brandType: "global",
      brandTypes: new Map([["tom_tailor", "global"], ["house", "private"]]),
    });

    expect(page).toMatchObject({
      total: 41,
      counts: { primary: 3, variant: 2, inStock: 3, outOfStock: 2, otherAvailability: 0 },
    });
    expect(page?.rows[0]).toMatchObject({ id: `${STORE}_1`, availability: "OUT_OF_STOCK", brandType: "global" });
    expect(opsOf("acs_catalog_mirror", "eq")).toEqual(
      expect.arrayContaining([["eq", "connection_id", STORE], ["eq", "product_type", "PRIMARY"]]),
    );
    expect(opsOf("acs_catalog_mirror", "in")).toEqual([["in", "brand_key", ["tom_tailor"]]]);
    expect(opsOf("acs_catalog_mirror", "ilike")).toEqual([["ilike", "haystack", "%tee\\_50\\%%"]]);
    expect(opsOf("acs_catalog_mirror", "order").map((op) => op[1])).toEqual(["primary_id", "product_type", "acs_id"]);
    expect(opsOf("acs_catalog_mirror", "range")).toEqual([["range", 25, 49]]);
  });

  it("falls back (null) when the mirror tables do not exist yet", async () => {
    answer = () => ({ data: null, error: { code: "PGRST205", message: "Could not find the table" } });
    expect(await readMirrorPage(STORE, { offset: 0, limit: 25 })).toBeNull();
  });
});

describe("mirror writes", () => {
  it("stops trusting a store's mirror when a write to it fails", async () => {
    answer = (call) =>
      call.table === "acs_catalog_mirror" ? { error: { code: "57014", message: "statement timeout" } } : { error: null };

    await mirrorImported([product("1"), product("1::v1", { type: "VARIANT", primaryProductId: `${STORE}_1` })]);

    const upserts = opsOf("acs_catalog_mirror_state", "upsert");
    expect(upserts).toHaveLength(1);
    expect(upserts[0][1]).toEqual([expect.objectContaining({ connection_id: STORE, complete_at: null })]);
  });

  it("files a variant under its parent so the table lists them together", async () => {
    await mirrorImported([product("1::v1", { type: "VARIANT", primaryProductId: `${STORE}_1` })]);

    const [[, rows]] = opsOf("acs_catalog_mirror", "upsert") as Array<[string, Array<Record<string, unknown>>]>;
    expect(rows[0]).toMatchObject({ acs_id: `${STORE}_1::v1`, primary_id: `${STORE}_1`, product_type: "VARIANT" });
  });

  it("keeps a path-config document for each parent, and none for a variant", async () => {
    await mirrorImported([
      product("1", { type: "PRIMARY", colorInfo: { colors: ["Black"] }, description: "Long copy" }),
      product("1::v1", { type: "VARIANT", primaryProductId: `${STORE}_1` }),
    ]);

    const [[, rows]] = opsOf("acs_catalog_mirror", "upsert") as Array<[string, Array<{ document: AcsProduct | null }>]>;
    expect(rows[0].document).toMatchObject({ id: `${STORE}_1`, colorInfo: { colors: ["Black"] }, brands: ["Tom Tailor"] });
    expect(rows[0].document).not.toHaveProperty("description");
    expect(rows[1].document).toBeNull();
  });
});

describe("readMirrorDocuments", () => {
  const trusted = () => ({ data: { complete_at: new Date().toISOString() } });

  it("returns a store's in-stock parents, with availability from its column", async () => {
    const document = { id: `${STORE}_1`, type: "PRIMARY", title: "Tee", categories: [] };
    answer = (call) =>
      call.table === "acs_catalog_mirror_state" ? trusted() : { data: [{ availability: "IN_STOCK", document }] };

    expect(await readMirrorDocuments(STORE)).toEqual([{ ...document, availability: "IN_STOCK" }]);
    expect(opsOf("acs_catalog_mirror", "eq")).toEqual([
      ["eq", "connection_id", STORE],
      ["eq", "product_type", "PRIMARY"],
      ["eq", "availability", "IN_STOCK"],
    ]);
  });

  it("pages past a thousand rows", async () => {
    const page = (offset: number, size: number) =>
      Array.from({ length: size }, (_, index) => ({ availability: "IN_STOCK", document: { id: `${offset + index}` } }));
    answer = (call) => {
      if (call.table === "acs_catalog_mirror_state") return trusted();
      const [, from] = call.ops.find((op) => op[0] === "range") as [string, number, number];
      return { data: from === 0 ? page(0, 1000) : page(1000, 3) };
    };

    expect(await readMirrorDocuments(STORE)).toHaveLength(1003);
    expect(opsOf("acs_catalog_mirror", "range")).toEqual([["range", 0, 999], ["range", 1000, 1999]]);
  });

  it("refuses an untrusted or long-unreconciled mirror, and rows written before documents were kept", async () => {
    answer = (call) => (call.table === "acs_catalog_mirror_state" ? { data: { complete_at: null } } : { data: [] });
    expect(await readMirrorDocuments(STORE)).toBeNull();

    const old = new Date(Date.now() - 7 * 60 * 60_000).toISOString();
    answer = (call) => (call.table === "acs_catalog_mirror_state" ? { data: { complete_at: old } } : { data: [] });
    expect(await readMirrorDocuments(STORE)).toBeNull();

    answer = (call) =>
      call.table === "acs_catalog_mirror_state" ? trusted() : { data: [{ availability: "IN_STOCK", document: null }] };
    expect(await readMirrorDocuments(STORE)).toBeNull();
  });
});

describe("publish stamp", () => {
  it("is kept on each row, so the previous catalog can be found without walking ACS", async () => {
    await mirrorImported([
      product("1", { attributes: { merchant_id: { text: [STORE] }, persona_publish_id: { text: ["run-9"] } } }),
      product("2"),
    ]);

    const [[, rows]] = opsOf("acs_catalog_mirror", "upsert") as Array<[string, Array<{ publish_id: string | null }>]>;
    expect(rows.map((row) => row.publish_id)).toEqual(["run-9", null]);
  });
});

describe("listStaleMirrorIds", () => {
  const trusted = () => ({ data: { complete_at: new Date().toISOString() } });

  it("lists the store's in-stock documents the publish did not write, unstamped ones included", async () => {
    answer = (call) =>
      call.table === "acs_catalog_mirror_state" ? trusted() : { data: [{ acs_id: `${STORE}_1` }, { acs_id: `${STORE}_2` }] };

    expect(await listStaleMirrorIds(STORE, "run-9")).toEqual([`${STORE}_1`, `${STORE}_2`]);
    expect(opsOf("acs_catalog_mirror", "eq")).toEqual([
      ["eq", "connection_id", STORE],
      ["eq", "availability", "IN_STOCK"],
    ]);
    expect(opsOf("acs_catalog_mirror", "or")).toEqual([["or", "publish_id.is.null,publish_id.neq.run-9"]]);
  });

  it("collects every page before returning, since marking them out of stock rewrites the rows", async () => {
    const page = (offset: number, size: number) =>
      Array.from({ length: size }, (_, index) => ({ acs_id: `${offset + index}` }));
    answer = (call) => {
      if (call.table === "acs_catalog_mirror_state") return trusted();
      const [, from] = call.ops.find((op) => op[0] === "range") as [string, number, number];
      return { data: from === 0 ? page(0, 1000) : page(1000, 2) };
    };

    expect(await listStaleMirrorIds(STORE, "run-9")).toHaveLength(1002);
  });

  it("returns null for a mirror that is not trusted, so the caller walks ACS", async () => {
    answer = (call) => (call.table === "acs_catalog_mirror_state" ? { data: { complete_at: null } } : { data: [] });

    expect(await listStaleMirrorIds(STORE, "run-9")).toBeNull();
    expect(opsOf("acs_catalog_mirror", "or")).toEqual([]);
  });
});

describe("source hashes", () => {
  it("are forgotten for a product taken out of stock, so a reconcile writes it again", async () => {
    await mirrorAvailability(`${STORE}_gid://shopify/Product/1::gid://shopify/ProductVariant/2`, "OUT_OF_STOCK");

    expect(opsOf("catalog_source_hashes", "eq")).toEqual([
      ["eq", "connection_id", STORE],
      ["eq", "external_id", "gid://shopify/Product/1"],
    ]);
  });

  it("are kept when a product comes back in stock", async () => {
    await mirrorAvailability(`${STORE}_1`, "IN_STOCK");

    expect(calls.some((call) => call.table === "catalog_source_hashes")).toBe(false);
  });
});

describe("reconcileMirror", () => {
  it("never overwrites a document written while the walk was paging, and prunes what ACS no longer holds", async () => {
    answer = (call) =>
      call.table === "acs_catalog_mirror" && call.ops.some((op) => op[0] === "select")
        ? { data: [{ acs_id: `${STORE}_2` }] }
        : { data: null, error: null };
    const walkStartedAt = Date.parse("2026-10-07T10:00:00.000Z");

    const ok = await reconcileMirror(STORE, [product("1"), product("2")], walkStartedAt);

    expect(ok).toBe(true);
    const [[, upserted]] = opsOf("acs_catalog_mirror", "upsert") as Array<[string, Array<{ acs_id: string }>]>;
    expect(upserted.map((row) => row.acs_id)).toEqual([`${STORE}_1`]);
    expect(opsOf("acs_catalog_mirror", "lt")).toEqual([["lt", "written_at", "2026-10-07T10:00:00.000Z"]]);
    const [[, state]] = opsOf("acs_catalog_mirror_state", "upsert") as Array<[string, { complete_at: string }]>;
    expect(state.complete_at).toEqual(expect.any(String));
  });
});
