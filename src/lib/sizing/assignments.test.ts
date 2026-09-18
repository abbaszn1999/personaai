import { describe, expect, it } from "vitest";
import { assignmentTotals, autoMatchAssignments, buildPathAssignments, indexAssignableVariants } from "./assignments";
import type { SizingChartRow } from "@/lib/db/sizing-charts";
import type { SizingChartAssignmentRow } from "@/lib/db/sizing-chart-assignments";
import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";
import type { SizingPathCoverageRow } from "@/lib/db/sizing-path-coverage";

/**
 * Stage 5's join, and the auto-match rule that decides how much of it a merchant has to do by hand.
 *
 * The rule is deliberately narrow — one variant, or an unmistakable breadcrumb — and most of what is
 * pinned here is what it declines to guess. An assignment that is wrong is worse than one that is
 * missing: a missing one shows up as unresolved and gets fixed, while a wrong one silently sizes every
 * shopper on the path against the wrong body while reporting the path as done.
 */
function pathRow(overrides: Partial<SizingPathCoverageRow> = {}): SizingPathCoverageRow {
  return {
    id: "path-1",
    connectionId: "conn-1",
    brandKey: "tommy_hilfiger",
    brandName: "Tommy Hilfiger",
    categoryId: "2",
    categoryPath: ["Men", "T-Shirts"],
    sizingCategory: "tops",
    skuCount: 40,
    ...overrides,
  };
}

function coverageRow(overrides: Partial<SizingCoverageRow> = {}): SizingCoverageRow {
  return {
    id: "cov-1",
    connectionId: "conn-1",
    brandKey: "tommy_hilfiger",
    brandName: "Tommy Hilfiger",
    brandType: "global",
    brandCanonicalName: null,
    sizingCategory: "tops",
    skuCount: 40,
    storeCategoryPaths: [["Men", "T-Shirts"]],
    sampleSkus: [],
    rawFormats: {},
    audienceHints: {},
    researchStatus: "found",
    researchNote: null,
    updatedAt: "2026-09-14T00:00:00Z",
    ...overrides,
  };
}

function chartRow(overrides: Partial<SizingChartRow> = {}): SizingChartRow {
  return {
    id: "chart-1",
    connectionId: null,
    brandKey: "tommy_hilfiger",
    sizingCategory: "tops",
    variantName: "Men Regular",
    variantGender: "mens",
    variantFitType: "regular",
    audience: "mens",
    sourceTitle: "Men's Tops",
    region: "EU",
    chartRows: [{ size: "M", chest_min: 96, chest_max: 104 }],
    confidence: 0.95,
    sourceUrl: "https://tommy.example/size-guide",
    provenance: "research",
    version: 1,
    updatedAt: "2026-09-14T00:00:00Z",
    ...overrides,
  };
}

function assignmentRow(overrides: Partial<SizingChartAssignmentRow> = {}): SizingChartAssignmentRow {
  return {
    id: "assign-1",
    connectionId: "conn-1",
    brandKey: "tommy_hilfiger",
    categoryId: "2",
    sizingCategory: "tops",
    variantName: "Men Regular",
    source: "merchant",
    ...overrides,
  };
}

function build(input: {
  pathCoverage?: SizingPathCoverageRow[];
  coverage?: SizingCoverageRow[];
  charts?: SizingChartRow[];
  assignments?: SizingChartAssignmentRow[];
}) {
  return buildPathAssignments({
    pathCoverage: input.pathCoverage ?? [pathRow()],
    coverage: input.coverage ?? [coverageRow()],
    charts: input.charts ?? [],
    assignments: input.assignments ?? [],
  });
}

describe("buildPathAssignments", () => {
  it("lists every path the catalog carries, assigned or not", () => {
    // Driven by path coverage rather than by stored assignments: a build that iterated assignments
    // would report the handful of decisions already made and omit every path still governing stock
    // with nothing behind it, which is the only thing this screen exists to show.
    const rows = build({
      pathCoverage: [pathRow({ id: "a" }), pathRow({ id: "b", categoryId: "4", categoryPath: ["Women", "Tops"] })],
      charts: [chartRow()],
      assignments: [assignmentRow()],
    });

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.categoryId === "2")?.variantName).toBe("Men Regular");
    expect(rows.find((row) => row.categoryId === "4")?.variantName).toBeNull();
  });

  it("offers every variant the brand published for the parent", () => {
    const [row] = build({
      charts: [chartRow({ id: "c1" }), chartRow({ id: "c2", variantName: "Women Regular", audience: "womens", variantGender: "womens" })],
    });

    expect(row.variants.map((variant) => variant.variantName)).toEqual(["Men Regular", "Women Regular"]);
    expect(row.variants[0].headers).toEqual(["Size", "Chest (cm)"]);
  });

  it("flags a stored choice research has since renamed away instead of clearing it", () => {
    const [row] = build({
      charts: [chartRow({ variantName: "Mens Regular Fit" })],
      assignments: [assignmentRow({ variantName: "Men Regular" })],
    });

    expect(row.missingVariant).toBe(true);
    expect(row.variantName).toBe("Men Regular");
    // Not counted as covered, because nothing exists to publish for it.
    expect(assignmentTotals([row]).assigned).toBe(0);
    expect(assignmentTotals([row]).unresolved).toBe(1);
  });

  it("separates an explicit no-chart decision from a path nobody has answered", () => {
    const [decided] = build({ assignments: [assignmentRow({ variantName: null })] });
    expect(decided.decided).toBe(true);
    expect(decided.variantName).toBeNull();

    const [untouched] = build({});
    expect(untouched.decided).toBe(false);
  });

  it("carries the brand type across from coverage so private labels read as such", () => {
    const [row] = build({
      coverage: [coverageRow({ brandType: "private" })],
    });

    expect(row.brandType).toBe("private");
  });

  it("names the unbranded bucket rather than showing an empty brand cell", () => {
    const [row] = build({
      pathCoverage: [pathRow({ brandKey: "", brandName: null })],
      coverage: [coverageRow({ brandKey: "", brandName: null, brandType: "none" })],
    });

    expect(row.brandName).toBe("No brand");
    expect(row.brandType).toBe("none");
  });

  it("drops a path whose sizing parent is no longer a known key", () => {
    // A vocabulary change under stored rows. There is no measurement set to render a chart against, so
    // there is nothing a merchant could do with the row.
    expect(build({ pathCoverage: [pathRow({ sizingCategory: "gadgets" })] })).toEqual([]);
  });

  it("leads with the paths governing the most stock", () => {
    const rows = build({
      pathCoverage: [
        pathRow({ id: "a", categoryId: "2", skuCount: 12 }),
        pathRow({ id: "b", categoryId: "4", skuCount: 900 }),
      ],
    });

    expect(rows.map((row) => row.skuCount)).toEqual([900, 12]);
  });
});

describe("indexAssignableVariants", () => {
  it("prefers this store's forked chart over the shared one it overrode", () => {
    const variants = indexAssignableVariants([
      chartRow({ id: "shared", connectionId: null, confidence: 0.95 }),
      chartRow({ id: "mine", connectionId: "conn-1", confidence: 0.6, provenance: "manual" }),
    ]);

    // Same variant name, so one entry — and it has to be the merchant's, or forking a chart to correct
    // it would leave Stage 5 assigning the numbers they deliberately replaced.
    const tops = variants.get("tommy_hilfiger|tops") ?? [];
    expect(tops).toHaveLength(1);
    expect(tops[0].chartId).toBe("mine");
    expect(tops[0].shared).toBe(false);
  });

  it("marks a chart below the confidence bar as needing review", () => {
    const variants = indexAssignableVariants([chartRow({ confidence: 0.5 })]);
    expect((variants.get("tommy_hilfiger|tops") ?? [])[0].needsReview).toBe(true);
  });
});

describe("autoMatchAssignments", () => {
  it("takes the only variant a brand published for the parent", () => {
    const paths = build({ charts: [chartRow()] });
    const matched = autoMatchAssignments(paths);

    expect(matched).toHaveLength(1);
    expect(matched[0].variantName).toBe("Men Regular");
  });

  it("reads an unmistakable audience off the merchant's own breadcrumb", () => {
    const paths = build({
      pathCoverage: [pathRow({ categoryPath: ["Women", "Tops"] })],
      charts: [
        chartRow({ id: "c1", variantName: "Men", variantGender: "mens", audience: "mens" }),
        chartRow({ id: "c2", variantName: "Women", variantGender: "womens", audience: "womens" }),
      ],
    });

    const matched = autoMatchAssignments(paths);
    expect(matched).toHaveLength(1);
    expect(matched[0].variantName).toBe("Women");
  });

  it("refuses to choose between two fits of the same audience", () => {
    // The case the restraint is for. Regular and Petite are both men's tops; picking either sizes the
    // path's shoppers against a body the merchant never confirmed.
    const paths = build({
      charts: [
        chartRow({ id: "c1", variantName: "Men Regular", variantFitType: "regular" }),
        chartRow({ id: "c2", variantName: "Men Tall", variantFitType: "tall" }),
      ],
    });

    expect(autoMatchAssignments(paths)).toEqual([]);
  });

  it("leaves an audience-less breadcrumb alone rather than treating unisex as an answer", () => {
    // `audienceFor` returns `unisex` both for a genuinely unisex path and for one it could not read at
    // all, so matching on it would bind every unlabelled path to whichever table happened to be filed
    // as unisex.
    const paths = build({
      pathCoverage: [pathRow({ categoryPath: ["Sale", "Clearance"] })],
      charts: [
        chartRow({ id: "c1", variantName: "Unisex", variantGender: null, audience: "unisex" }),
        chartRow({ id: "c2", variantName: "Women", variantGender: "womens", audience: "womens" }),
      ],
    });

    expect(autoMatchAssignments(paths)).toEqual([]);
  });

  it("never revisits a path that already has a decision", () => {
    // Including an explicit no-chart. A later research pass discovering a variant must not overturn a
    // choice the merchant already made.
    const assigned = build({ charts: [chartRow()], assignments: [assignmentRow()] });
    expect(autoMatchAssignments(assigned)).toEqual([]);

    const skipped = build({ charts: [chartRow()], assignments: [assignmentRow({ variantName: null })] });
    expect(autoMatchAssignments(skipped)).toEqual([]);
  });

  it("does nothing for a brand with no charts yet", () => {
    expect(autoMatchAssignments(build({}))).toEqual([]);
  });
});

describe("assignmentTotals", () => {
  it("weights the outstanding work by the stock it governs", () => {
    const totals = assignmentTotals(
      build({
        pathCoverage: [
          pathRow({ id: "a", categoryId: "2", skuCount: 40 }),
          pathRow({ id: "b", categoryId: "4", skuCount: 900 }),
          pathRow({ id: "c", categoryId: "5", skuCount: 7 }),
        ],
        charts: [chartRow()],
        assignments: [
          assignmentRow({ categoryId: "2" }),
          assignmentRow({ id: "assign-2", categoryId: "5", variantName: null }),
        ],
      })
    );

    expect(totals).toEqual({
      paths: 3,
      assigned: 1,
      assignedSkus: 40,
      unresolved: 1,
      unresolvedSkus: 900,
      skipped: 1,
    });
  });
});
