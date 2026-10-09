import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ db: {} }));

const { SETUP_TABLES, brandMappingAfterReset } = await import("./setup-reset");

const confirmed = {
  version: 1,
  confirmedAt: "2026-10-01T00:00:00.000Z",
  sourceFingerprint: "v1-abc",
  observed: { moustache_men: ["Moustache Men"] },
  aliases: {
    nike: { canonicalKey: "nike", canonicalName: "Nike", labels: ["Nike"], skuCount: 3, sizingCategories: ["top"] },
  },
  privateAliases: {
    moustache_men: {
      canonicalKey: "moustache",
      canonicalName: "Moustache",
      labels: ["Moustache Men"],
      skuCount: 5,
      sizingCategories: ["top"],
    },
  },
};

describe("SETUP_TABLES", () => {
  it("never includes the merchant's hand-filled private charts", () => {
    expect(SETUP_TABLES).not.toContain("sizing_charts_private");
  });

  it("still clears everything a scan can rebuild", () => {
    expect(SETUP_TABLES).toEqual(
      expect.arrayContaining(["sizing_runs", "sizing_coverage", "sizing_path_coverage", "sizing_product_records"]),
    );
  });
});

describe("brandMappingAfterReset", () => {
  it("clears the global brand mapping so it is confirmed again, but keeps the private label groups", () => {
    const next = brandMappingAfterReset(confirmed);

    expect(next.confirmedAt).toBeNull();
    expect(next.sourceFingerprint).toBe("");
    expect(next.aliases).toEqual({});
    expect(next.observed).toEqual({});
    expect(next.privateAliases.moustache_men?.canonicalKey).toBe("moustache");
  });

  it("clears the private groups too when the merchant asked to delete their private charts", () => {
    const next = brandMappingAfterReset(confirmed, { wipePrivate: true });

    expect(next.privateAliases).toEqual({});
    expect(next.aliases).toEqual({});
    expect(next.confirmedAt).toBeNull();
  });

  it("starts empty when there is no stored mapping or it is malformed", () => {
    for (const stored of [null, undefined, "nope", []]) {
      const next = brandMappingAfterReset(stored);
      expect(next.privateAliases).toEqual({});
      expect(next.aliases).toEqual({});
    }
  });
});
