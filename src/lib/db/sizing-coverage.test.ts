import { beforeEach, describe, expect, it, vi } from "vitest";

const selects = vi.fn();
const updates = vi.fn();

function chain(result: () => unknown): unknown {
  return new Proxy(
    { then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve) },
    {
      get(target, property) {
        if (property === "then") return target.then;
        return () => chain(result);
      },
    },
  );
}

vi.mock("@/lib/supabase/server", () => ({
  db: {
    from: () => ({
      select: () => {
        selects();
        return chain(() => ({
          data: [{ id: "row-1", connection_id: "store", brand_key: "penti", brand_type: "global", sizing_category: "tops", sku_count: 3 }],
          error: null,
        }));
      },
      update: () => {
        updates();
        return chain(() => ({ data: [{ id: "row-1" }], error: null }));
      },
    }),
  },
}));

const coverage = await import("./sizing-coverage");

beforeEach(() => {
  selects.mockClear();
  updates.mockClear();
  coverage.forgetSizingCoverage("store");
});

describe("coverage memo", () => {
  it("serves screens loading together from one read, each with its own copy", async () => {
    const [first, second] = await Promise.all([
      coverage.listSizingCoverage("store"),
      coverage.listSizingCoverage("store"),
    ]);

    expect(selects).toHaveBeenCalledTimes(1);
    first[0].skuCount = 99;
    expect(second[0].skuCount).toBe(3);
  });

  it("reads again after a write to this store's coverage", async () => {
    await coverage.listSizingCoverage("store");
    await coverage.setBrandType("store", "penti", "private");
    await coverage.listSizingCoverage("store");

    expect(updates).toHaveBeenCalledTimes(1);
    expect(selects).toHaveBeenCalledTimes(2);
  });
});
