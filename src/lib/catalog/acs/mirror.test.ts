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
