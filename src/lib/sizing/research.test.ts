import { describe, expect, it, vi } from "vitest";
import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";

// `research.ts` also imports the Supabase-backed `sizing-coverage`/`sizing-charts` modules for the
// network-calling half of the file, which throw at import time without real Supabase env vars set.
// This test only exercises the pure grouping function, so those modules are stubbed rather than
// pulling Supabase config into a unit test that never touches the database.
vi.mock("@/lib/db/sizing-coverage", () => ({ listSizingCoverage: vi.fn() }));
vi.mock("@/lib/db/sizing-charts", () => ({ listChartsForBrands: vi.fn(), upsertChart: vi.fn() }));

const { groupGlobalBrandsNeeded, marketHintFor, screenTables, variantNameFor, resolveVariantNames } =
  await import("./research");
type ExtractedTable = Awaited<ReturnType<typeof import("./research").findBrandChart>>["tables"][number];

/**
 * Step 0's grouping is pure and free, but it is also the input every later step trusts: a brand
 * that shows up twice, or a category dropped from its list, silently under- or over-pays for
 * research. This is the whole risk surface that isn't an actual network call.
 */
function row(overrides: Partial<SizingCoverageRow>): SizingCoverageRow {
  return {
    id: "row-id",
    connectionId: "conn-1",
    brandKey: "nike",
    brandName: "Nike",
    brandType: "global",
    sizingCategory: "tops",
    skuCount: 10,
    storeCategoryPaths: [],
    sampleSkus: [],
    rawFormats: {},
    audienceHints: {},
    researchStatus: "pending",
    researchNote: null,
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("groupGlobalBrandsNeeded", () => {
  it("groups a brand's categories under one entry", () => {
    const coverage = [row({ sizingCategory: "tops" }), row({ sizingCategory: "bottoms" })];

    const grouped = groupGlobalBrandsNeeded(coverage);

    expect(grouped.size).toBe(1);
    expect(grouped.get("nike")?.requests.map((r) => r.sizingCategory).sort()).toEqual(["bottoms", "tops"]);
  });

  it("carries the store's own raw size strings so 4b can pick the matching label column", () => {
    const coverage = [row({ sizingCategory: "tops", rawFormats: { "S,M,L": { count: 4, canonical: null } } })];

    const grouped = groupGlobalBrandsNeeded(coverage);

    expect(grouped.get("nike")?.requests[0].rawLabels).toEqual(["S,M,L"]);
  });

  it("skips private and unclassified brands — only global reaches web search", () => {
    const coverage = [
      row({ brandKey: "nike", brandType: "global" }),
      row({ brandKey: "urban_basics", brandName: "Urban Basics", brandType: "private" }),
      row({ brandKey: "acme", brandName: "Acme", brandType: "unclassified" }),
    ];

    const grouped = groupGlobalBrandsNeeded(coverage);

    expect([...grouped.keys()]).toEqual(["nike"]);
  });

  it("skips the unbranded sentinel even if it were ever marked global", () => {
    const coverage = [row({ brandKey: "", brandName: null, brandType: "global" })];
    expect(groupGlobalBrandsNeeded(coverage).size).toBe(0);
  });

  it("drops a row whose sizing category this build does not know rather than crash", () => {
    const coverage = [row({ sizingCategory: "not-a-real-key" })];
    expect(groupGlobalBrandsNeeded(coverage).size).toBe(0);
  });

  it("never lists the same category twice for one brand", () => {
    const coverage = [row({ sizingCategory: "tops" }), row({ sizingCategory: "tops", id: "row-2" })];

    const grouped = groupGlobalBrandsNeeded(coverage);
    expect(grouped.get("nike")?.requests).toHaveLength(1);
  });

  // Research decides what to re-search from this status, and a pair can finish without ever
  // producing a chart — a brand with no footwear line settles at `not_covered`. Losing the status
  // here made that pair look outstanding forever, so every job tick re-paid for the same search.
  it("carries what research already concluded for each pair", () => {
    const coverage = [
      row({ sizingCategory: "tops", researchStatus: "found" }),
      row({ sizingCategory: "footwear", researchStatus: "not_covered" }),
      row({ sizingCategory: "bottoms" }),
    ];

    const requests = groupGlobalBrandsNeeded(coverage).get("nike")?.requests ?? [];

    expect(Object.fromEntries(requests.map((req) => [req.sizingCategory, req.researchStatus]))).toEqual({
      tops: "found",
      footwear: "not_covered",
      bottoms: "pending",
    });
  });
});

/**
 * The check that stands between a transcription and a stored chart.
 *
 * This exists because of one real failure: Tommy Hilfiger's men's tops table came back with ten
 * size headers and twenty values per row, and every measurement in it was therefore attached to the
 * wrong size. That chart looked entirely plausible downstream, which makes it worse than no chart —
 * so the misalignment has to be caught here, and it cannot be expressed in JSON Schema.
 */
function table(overrides: Partial<ExtractedTable> = {}): ExtractedTable {
  return {
    title: "Men's Tops",
    section: null,
    audience: "mens",
    variantName: "Men",
    variantGender: "mens",
    variantFitType: null,
    garmentGroup: "tops",
    measurementKind: "body",
    unit: "cm",
    region: "EU",
    sourceUrl: "https://brand.example/size-guide/men",
    columns: ["Size", "Chest"],
    rows: [
      ["S", "88-96"],
      ["M", "96-104"],
    ],
    ...overrides,
  };
}

describe("screenTables", () => {
  it("keeps a table whose every row has one cell per column", () => {
    const { usable, rejected } = screenTables([table()]);

    expect(usable).toHaveLength(1);
    expect(rejected).toEqual([]);
  });

  it("rejects the misaligned table that produced the unusable Tommy chart", () => {
    const { usable, rejected } = screenTables([
      table({ columns: ["Size", "Chest"], rows: [["S", "88-96"], ["M", "96-104", "104-112"]] }),
    ]);

    expect(usable).toEqual([]);
    expect(rejected[0].reason).toContain("row 2 has 3 cells against 2 columns");
  });

  it("drops garment measurements rather than storing them as if they were bodies", () => {
    const { usable, rejected } = screenTables([table({ measurementKind: "garment" })]);

    expect(usable).toEqual([]);
    expect(rejected[0].reason).toContain("measures the garment");
  });

  it("drops a table that maps onto no sizing group we hold measurements for", () => {
    const { usable, rejected } = screenTables([table({ garmentGroup: "other" })]);

    expect(usable).toEqual([]);
    expect(rejected[0].reason).toContain("no sizing group");
  });

  it("drops an empty table and one with nothing to key on", () => {
    const { usable, rejected } = screenTables([
      table({ title: "Empty", rows: [] }),
      table({ title: "One column", columns: ["Size"], rows: [["S"]] }),
    ]);

    expect(usable).toEqual([]);
    expect(rejected.map((r) => r.title)).toEqual(["Empty", "One column"]);
  });

  it("rejects only the bad table, keeping the rest of a brand's guide", () => {
    // A brand publishing fifteen tables should not lose all of them to one bad transcription.
    const { usable, rejected } = screenTables([
      table({ title: "Good" }),
      table({ title: "Bad", rows: [["S"]] }),
      table({ title: "Also good", garmentGroup: "bottoms" }),
    ]);

    expect(usable.map((t) => t.title)).toEqual(["Good", "Also good"]);
    expect(rejected.map((t) => t.title)).toEqual(["Bad"]);
  });
});

/**
 * Doc Part 5's variant naming, and the guard that keeps two variants from becoming one.
 *
 * `sizing_charts` is uniquely indexed on `(brand_key, sizing_category, variant_name)` and
 * `upsertChart` deletes that key before inserting, so two charts sharing a name is not a cosmetic
 * problem — the second silently destroys the first, with no error on any path. The model is
 * instructed not to do it; these tests are what make that not matter.
 */
describe("variantNameFor", () => {
  it("uses the name the guide gave", () => {
    expect(variantNameFor(table({ variantName: "Men Tall" }))).toBe("Men Tall");
  });

  it("falls back to the stated gender, not the table heading", () => {
    // A heading like "TOPS, OUTERWEAR, CASUAL SHIRTS" is noise in Phase 5's dropdown; "Women" is
    // both the likely right answer and one a merchant can act on.
    const named = variantNameFor(
      table({ variantName: "", variantGender: "womens", title: "TOPS, OUTERWEAR, CASUAL SHIRTS" })
    );
    expect(named).toBe("Women");
  });

  it("falls back to the table's audience when the gender is absent too", () => {
    expect(variantNameFor(table({ variantName: "", variantGender: null, audience: "kids" }))).toBe("Kids");
  });
});

describe("resolveVariantNames", () => {
  const chartFor = (overrides: Partial<ExtractedTable>) => ({
    table: table(overrides),
    group: (overrides.garmentGroup ?? "tops") as "tops" | "bottoms",
    confidence: 0.9,
    rows: [],
  });

  it("leaves distinct names alone", () => {
    const resolved = resolveVariantNames([
      chartFor({ variantName: "Men" }),
      chartFor({ variantName: "Women" }),
    ]);

    expect(resolved.map((r) => r.variantName)).toEqual(["Men", "Women"]);
  });

  it("keeps the same name in two different parents", () => {
    // `Men` under tops and `Men` under bottoms are different rows in the index, so disambiguating
    // them would invent a difference the brand does not publish.
    const resolved = resolveVariantNames([
      chartFor({ variantName: "Men", garmentGroup: "tops" }),
      chartFor({ variantName: "Men", garmentGroup: "bottoms" }),
    ]);

    expect(resolved.map((r) => r.variantName)).toEqual(["Men", "Men"]);
  });

  it("disambiguates a collision with the heading rather than dropping a chart", () => {
    const resolved = resolveVariantNames([
      chartFor({ variantName: "Men", title: "MAINLINE" }),
      chartFor({ variantName: "Men", title: "DRESSES", section: "TOMMY JEANS SIZES" }),
    ]);

    expect(resolved[0].variantName).toBe("Men");
    expect(resolved[1].variantName).toBe("Men — TOMMY JEANS SIZES — DRESSES");
  });

  it("falls back to a counter when even the headings match", () => {
    const resolved = resolveVariantNames([
      chartFor({ variantName: "Men", title: "TOPS" }),
      chartFor({ variantName: "Men", title: "TOPS" }),
      chartFor({ variantName: "Men", title: "TOPS" }),
    ]);

    // Every chart survives with a distinct name, which is the whole requirement — none of them can
    // delete another on write.
    expect(new Set(resolved.map((r) => r.variantName)).size).toBe(3);
  });
});

describe("marketHintFor", () => {
  it("names the merchant's own storefront so the finder lands on the right regional guide", () => {
    expect(marketHintFor("https://shop.example.gr/collections")).toContain("shop.example.gr");
  });

  it("survives a store URL that is not a URL", () => {
    expect(marketHintFor("not a url")).toContain("not a url");
  });

  it("asks for the European guide when there is no store URL to go on", () => {
    expect(marketHintFor(null)).toContain("European");
  });
});
