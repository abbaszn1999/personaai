import { describe, expect, it } from "vitest";
import type { SizeChartRow } from "./chart-schema";
import { canonicalSizesForRawFormat, matchLabel, matchRawFormat } from "./canonical";

const SHOE_ROWS: SizeChartRow[] = [
  { size: "39", aliases: { eu: "39", uk: "6", us: "6.5" }, foot_length_min: 24.5, foot_length_max: 25 },
  { size: "40", aliases: { eu: "40", uk: "6.5", us: "7" }, foot_length_min: 25, foot_length_max: 25.5 },
];

describe("matchLabel", () => {
  it("matches against the store's declared system, not just any column", () => {
    // UK 6.5 is size 40; US 6.5 is size 39 -- same raw label, different row, purely because of
    // which system the store declared.
    expect(matchLabel("6.5", SHOE_ROWS, "UK")).toMatchObject({ row: SHOE_ROWS[1], matchedVia: "uk" });
    expect(matchLabel("6.5", SHOE_ROWS, "US")).toMatchObject({ row: SHOE_ROWS[0], matchedVia: "us" });
  });

  it("normalizes case and surrounding whitespace before comparing", () => {
    expect(matchLabel("  6.5  ", SHOE_ROWS, "UK")).toMatchObject({ row: SHOE_ROWS[1], matchedVia: "uk" });
    expect(matchLabel(" m ", [{ size: "M" }], "Alpha")).toMatchObject({ row: { size: "M" }, matchedVia: "alpha" });
  });

  it("falls back to alpha before conceding, since alpha is not a market claim", () => {
    const rows: SizeChartRow[] = [{ size: "M", aliases: { alpha: "M", eu: "38" } }];
    // Declared EU, stock says "M" — EU has nothing named "M", but alpha does.
    expect(matchLabel("M", rows, "EU")).toMatchObject({ row: rows[0], matchedVia: "alpha" });
  });

  it("widens to any label on the chart as a last resort, flagged as needing review", () => {
    const rows: SizeChartRow[] = [{ size: "41", aliases: { eu: "41" } }];
    // Declared US, stock says "41" (the chart's EU size). No US column exists on this chart at
    // all, so a hit only comes from the full, undeclared-system flatten.
    const result = matchLabel("41", rows, "US");
    expect(result).toMatchObject({ row: rows[0], matchedVia: null });
  });

  it("returns no match when nothing on the chart answers to the label", () => {
    expect(matchLabel("99", SHOE_ROWS, "EU")).toEqual({ raw: "99", row: null, matchedVia: null });
  });

  it("returns no match for a blank label without touching the rows", () => {
    expect(matchLabel("   ", SHOE_ROWS, "EU")).toEqual({ raw: "   ", row: null, matchedVia: null });
  });

  it("trusts the primary `size` for the declared key when no alias duplicates it", () => {
    // The single-request research prompt deliberately makes `size` the column matching the
    // merchant's own observed labels when one was supplied, without also duplicating it into
    // `aliases` (parseAliases drops an alias equal to `size`). A numeric-declared store whose
    // stock says "32" must still match this row through `size` alone.
    const rows: SizeChartRow[] = [{ size: "32", aliases: { alpha: "M" } }];
    expect(matchLabel("32", rows, "Numeric")).toMatchObject({ row: rows[0], matchedVia: "numeric" });
  });
});

describe("matchRawFormat", () => {
  it("resolves every label in a comma-joined raw format", () => {
    const result = matchRawFormat("6.5,7", SHOE_ROWS, "US");
    expect(result.fullyMatched).toBe(true);
    expect(result.needsReview).toBe(false);
    expect(result.matches.map((m) => m.row?.size)).toEqual(["39", "40"]);
  });

  it("flags partial resolution rather than pretending the whole format matched", () => {
    const result = matchRawFormat("6.5,99", SHOE_ROWS, "US");
    expect(result.fullyMatched).toBe(false);
  });

  it("flags needsReview when a label only resolved on the widened pass", () => {
    const rows: SizeChartRow[] = [{ size: "41", aliases: { eu: "41" } }];
    const result = matchRawFormat("41", rows, "US");
    expect(result.fullyMatched).toBe(true);
    expect(result.needsReview).toBe(true);
  });
});

describe("canonicalSizesForRawFormat", () => {
  it("returns the chart's own primary size labels when every label resolves", () => {
    expect(canonicalSizesForRawFormat("6.5,7", SHOE_ROWS, "US")).toEqual(["39", "40"]);
  });

  it("returns null rather than a partial list when any label fails to resolve", () => {
    expect(canonicalSizesForRawFormat("6.5,99", SHOE_ROWS, "US")).toBeNull();
  });
});
