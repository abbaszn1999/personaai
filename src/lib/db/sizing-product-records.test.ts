import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ db: {} }));

import { buildProductSearchClause, personaPathFilter } from "./sizing-product-records";

describe("buildProductSearchClause", () => {
  it("finds a brand typed with spaces and capitals through its normalised key", () => {
    const clause = buildProductSearchClause("MOUSTACHE WOMEN")!;
    expect(clause).toContain("brand_key.ilike.*moustache_women*");
    expect(clause).toContain("title.ilike.*MOUSTACHE WOMEN*");
    expect(clause).toContain("brand_label.ilike.*MOUSTACHE WOMEN*");
    expect(clause).toContain("sku.ilike.*MOUSTACHE WOMEN*");
  });

  it("matches a partial brand through the key", () => {
    expect(buildProductSearchClause("moust wom")).toContain("brand_key.ilike.*moust_wom*");
  });

  it("strips characters that would break the or-grammar or widen the match", () => {
    const clause = buildProductSearchClause('a,b(c)*%"d')!;
    expect(clause).not.toMatch(/[()"%]/);
    expect(clause.split(",").length).toBe(4);
  });

  it("is null for empty or punctuation-only text", () => {
    expect(buildProductSearchClause("   ")).toBeNull();
    expect(buildProductSearchClause("%%")).toBeNull();
  });

  it("omits the key clause when the text normalises to nothing", () => {
    const clause = buildProductSearchClause("&")!;
    expect(clause).toContain("title.ilike");
    expect(clause).not.toContain("brand_key");
  });
});

describe("personaPathFilter", () => {
  it("treats a trailing colon as a department or category prefix and anything else as exact", () => {
    expect(personaPathFilter("women:")).toEqual({ kind: "prefix", value: "women:" });
    expect(personaPathFilter("women:top:")).toEqual({ kind: "prefix", value: "women:top:" });
    expect(personaPathFilter("women:top:t_shirt")).toEqual({ kind: "exact", value: "women:top:t_shirt" });
  });
});
