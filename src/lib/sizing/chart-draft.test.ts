import { describe, expect, it } from "vitest";
import {
  draftColumnsFor,
  draftRowsFrom,
  formatDraftBound,
  parseDraft,
  parseDraftBound,
  type ChartDraftRow,
} from "./chart-draft";

/**
 * The conversion between what a merchant types and what the shopper filter runs against.
 *
 * Worth testing closely because every failure here is silent: a cell misread as the wrong bound, or
 * dropped for being unparseable, produces a chart that looks filled in on screen and matches nobody
 * at retrieval time. There is no error path that would tell anyone.
 */

describe("parseDraftBound", () => {
  it("reads a range", () => {
    expect(parseDraftBound("96-104")).toEqual({ min: 96, max: 104 });
  });

  it("accepts the dashes a brand's page actually uses", () => {
    // A merchant copying from a size guide brings whichever dash that page used; rejecting an en
    // dash would read as the numbers being wrong.
    expect(parseDraftBound("96 – 104")).toEqual({ min: 96, max: 104 });
    expect(parseDraftBound("96—104")).toEqual({ min: 96, max: 104 });
  });

  it("sets both bounds from a single number rather than inventing a spread", () => {
    expect(parseDraftBound("96")).toEqual({ min: 96, max: 96 });
  });

  it("reads an open top and an open bottom", () => {
    expect(parseDraftBound("120+")).toEqual({ min: 120, max: null });
    expect(parseDraftBound("up to 86")).toEqual({ min: null, max: 86 });
  });

  it("straightens a reversed range instead of calling correct numbers invalid", () => {
    expect(parseDraftBound("104-96")).toEqual({ min: 96, max: 104 });
  });

  it("returns null for anything it cannot read, rather than guessing", () => {
    expect(parseDraftBound("")).toBeNull();
    expect(parseDraftBound("medium")).toBeNull();
    expect(parseDraftBound("96 to 104")).toBeNull();
  });

  it("round-trips through formatDraftBound", () => {
    for (const text of ["96-104", "96", "120+", "up to 86"]) {
      const bound = parseDraftBound(text)!;
      expect(parseDraftBound(formatDraftBound(bound.min, bound.max))).toEqual(bound);
    }
  });
});

describe("draftColumnsFor", () => {
  it("asks a Bottoms chart for waist and never for chest", () => {
    // Doc Part 6's fixed template. Offering every measurement to every parent is how a merchant
    // ends up filling a chest column on a trousers chart that nothing will ever read.
    const columns = draftColumnsFor("bottoms");

    expect(columns.find((c) => c.measurement === "waist")?.required).toBe(true);
    expect(columns.some((c) => c.measurement === "chest")).toBe(false);
  });

  it("offers the optional fields too, so real numbers need not be discarded", () => {
    const columns = draftColumnsFor("tops");

    expect(columns.find((c) => c.measurement === "chest")?.required).toBe(true);
    expect(columns.find((c) => c.measurement === "sleeve")?.required).toBe(false);
  });
});

describe("parseDraft", () => {
  const row = (size: string, values: Record<string, string>): ChartDraftRow => ({ size, values });

  it("converts a filled grid into chart rows", () => {
    const { rows, problems } = parseDraft(
      [row("S", { chest: "88-96" }), row("M", { chest: "96-104" })],
      "tops"
    );

    expect(problems).toEqual([]);
    expect(rows).toEqual([
      { size: "S", chest_min: 88, chest_max: 96 },
      { size: "M", chest_min: 96, chest_max: 104 },
    ]);
  });

  it("drops the untouched seeded rows without complaining about them", () => {
    // The grid opens with five blank rows. A merchant who used two has not made a mistake.
    const { rows, problems } = parseDraft(
      [row("S", { chest: "88-96" }), row("", {}), row("", {})],
      "tops"
    );

    expect(rows).toHaveLength(1);
    expect(problems).toEqual([]);
  });

  it("refuses a row missing the parent's required measurement", () => {
    const { problems } = parseDraft([row("S", { waist: "70-76" })], "tops");

    expect(problems[0]).toMatchObject({ rowIndex: 0, measurement: "chest" });
  });

  it("reports a cell it cannot read instead of dropping it", () => {
    const { problems } = parseDraft([row("S", { chest: "about 90ish" })], "tops");

    expect(problems[0].message).toContain("not a measurement");
  });

  it("catches measurements with a size label attached to nothing", () => {
    const { problems } = parseDraft([row("", { chest: "88-96" })], "tops");

    expect(problems[0].message).toContain("no size label");
  });

  it("rejects two rows with the same label", () => {
    // Phase 8 maps a SKU's raw size onto one of these rows. Two called `M` give two answers.
    const { problems } = parseDraft(
      [row("M", { chest: "96-104" }), row("m", { chest: "100-108" })],
      "tops"
    );

    expect(problems[0].message).toContain("both labelled");
  });

  it("surfaces an implausible value rather than silently dropping the column", () => {
    // `parseSizeChartRow` discards a bound outside the range a body can be. Without this check the
    // chart would save looking complete, missing the column the merchant thought they filled.
    const { problems } = parseDraft([row("S", { chest: "900-1000" })], "tops");

    expect(problems.some((p) => p.message.includes("outside the range"))).toBe(true);
  });

  it("asks for at least one size when the grid is entirely blank", () => {
    const { rows, problems } = parseDraft([row("", {}), row("", {})], "tops");

    expect(rows).toEqual([]);
    expect(problems[0].message).toContain("at least one size");
  });

  it("round-trips a stored chart back through the editor unchanged", () => {
    // What Make Template depends on: forking a researched variant must not alter its numbers.
    const stored = [
      { size: "S", chest_min: 88, chest_max: 96 },
      { size: "M", chest_min: 96, chest_max: 104 },
    ];

    expect(parseDraft(draftRowsFrom(stored, "tops"), "tops").rows).toEqual(stored);
  });
});
