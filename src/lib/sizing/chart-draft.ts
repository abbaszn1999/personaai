import { parseSizeChartRow, type SizeChartRow } from "./chart-schema";
import {
  MEASUREMENTS,
  measurementsFor,
  requiredMeasurementsFor,
  type Measurement,
  type SizingGroup,
} from "./measurements";

/**
 * Doc Parts 4 and 6 — the editing model behind a hand-filled size chart.
 *
 * Pure and separate from the modal because it is the half that can be wrong in ways nobody sees. A
 * merchant types `96-104` into a box; what reaches `sizing_charts` is `chest_min: 96, chest_max:
 * 104`, and the same shopper filter runs against it as against a researched chart. A parse that
 * silently reads `104` as the minimum, or accepts a blank as a bound of zero, produces a chart that
 * looks filled in and matches nobody.
 *
 * The doc's fixed-template rule lives here too: columns come from the parent category, so a merchant
 * filling a Bottoms chart is asked for waist and never for chest.
 */

/** One column of the editable grid, in the order it is shown. */
export interface ChartDraftColumn {
  measurement: Measurement;
  label: string;
  /** Doc Part 6's "main fields". The chart is not saveable until every row has these. */
  required: boolean;
}

/** One row as the merchant is editing it: raw text per measurement, keyed by measurement. */
export interface ChartDraftRow {
  size: string;
  /** Free text as typed — `96-104`, `96`, `120+`, or empty. Parsed only on save. */
  values: Partial<Record<Measurement, string>>;
}

/**
 * The template for a parent: required measurements first, then optional.
 *
 * Both are offered rather than only the required set, because doc Part 6 lists the optional fields
 * as part of each template and a brand's own printed chart usually has them. Leaving them out would
 * force a merchant to discard real numbers they are looking at.
 */
export function draftColumnsFor(group: SizingGroup): ChartDraftColumn[] {
  const required = new Set<Measurement>(requiredMeasurementsFor(group));
  return measurementsFor(group).map((measurement) => ({
    measurement,
    label: MEASUREMENTS[measurement].label,
    required: required.has(measurement),
  }));
}

/** A blank grid to start from. */
export function emptyDraftRows(group: SizingGroup, count = 5): ChartDraftRow[] {
  const seed = group === "footwear" ? FOOTWEAR_SEED : ALPHA_SEED;
  return Array.from({ length: count }, (_, index) => ({
    size: seed[index] ?? "",
    values: {},
  }));
}

// Labels only, never measurements. Pre-filling a size *name* saves typing and is trivially
// overwritten; pre-filling a measurement would be inventing body data attributed to the merchant.
const ALPHA_SEED = ["XS", "S", "M", "L", "XL"];
const FOOTWEAR_SEED = ["38", "39", "40", "41", "42"];

/**
 * Turns a stored chart back into an editable grid — doc Part 6's "editable as a table", and the
 * seed for Phase 5's Make Template, which forks a merchant-owned copy of a researched variant.
 */
export function draftRowsFrom(rows: SizeChartRow[], group: SizingGroup): ChartDraftRow[] {
  return rows.map((row) => {
    const values: Partial<Record<Measurement, string>> = {};
    for (const { measurement } of draftColumnsFor(group)) {
      const min = row[`${measurement}_min`];
      const max = row[`${measurement}_max`];
      const text = formatDraftBound(min, max);
      if (text) values[measurement] = text;
    }
    return { size: row.size, values };
  });
}

/** The inverse of `parseDraftBound`, so a chart survives a round trip through the editor. */
export function formatDraftBound(min: unknown, max: unknown): string {
  const lo = typeof min === "number" ? min : null;
  const hi = typeof max === "number" ? max : null;

  if (lo === null && hi === null) return "";
  if (lo !== null && hi === null) return `${lo}+`;
  if (lo === null && hi !== null) return `up to ${hi}`;
  if (lo === hi) return `${lo}`;
  return `${lo}-${hi}`;
}

/**
 * One typed cell to a measurement range.
 *
 * Returns `null` for anything it cannot read, and the caller reports that rather than storing a
 * guess. Every accepted form is one a merchant plausibly types while copying a printed chart:
 *
 *   `96-104` / `96 – 104`   a range              `96`        one number, both bounds
 *   `120+`                  open at the top      `up to 86`  open at the bottom
 */
export function parseDraftBound(text: string): { min: number | null; max: number | null } | null {
  const value = text.trim().replace(/\s+/g, " ");
  if (!value) return null;

  const openTop = /^(-?[\d.]+)\s*\+$/.exec(value);
  if (openTop) return finite(Number(openTop[1])) ? { min: Number(openTop[1]), max: null } : null;

  const openBottom = /^(?:up to|max|<=?)\s*(-?[\d.]+)$/i.exec(value);
  if (openBottom) return finite(Number(openBottom[1])) ? { min: null, max: Number(openBottom[1]) } : null;

  // En and em dashes as well as a hyphen: a merchant pasting from a brand's page brings whichever
  // that page used, and rejecting it would read as the number itself being wrong.
  const range = /^(-?[\d.]+)\s*[-–—]\s*(-?[\d.]+)$/.exec(value);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (!finite(min) || !finite(max)) return null;
    // Accepted reversed rather than rejected: `104-96` is unambiguous about intent, and the only
    // alternative is telling someone their correct numbers are invalid.
    return min <= max ? { min, max } : { min: max, max: min };
  }

  const single = Number(value);
  return finite(single) ? { min: single, max: single } : null;
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

export interface DraftProblem {
  rowIndex: number;
  /** Absent when the problem is the size label itself. */
  measurement?: Measurement;
  message: string;
}

export interface ParsedDraft {
  rows: SizeChartRow[];
  problems: DraftProblem[];
}

/**
 * Validates and converts the whole grid.
 *
 * Rows that are entirely blank are dropped rather than reported — a merchant who used three of five
 * seeded rows has not made a mistake. Everything else is reported with its cell, because the one
 * outcome to avoid is a chart that saves with a column silently missing.
 *
 * Final conversion goes through `parseSizeChartRow`, the same function research output passes
 * through, so a hand-filled chart is held to the identical plausibility rules — a waist of 900cm is
 * rejected whether a model or a merchant typed it.
 */
export function parseDraft(rows: ChartDraftRow[], group: SizingGroup): ParsedDraft {
  const columns = draftColumnsFor(group);
  const problems: DraftProblem[] = [];
  const parsed: SizeChartRow[] = [];
  const seen = new Set<string>();

  rows.forEach((row, rowIndex) => {
    const size = row.size.trim();
    const filled = columns.filter(({ measurement }) => (row.values[measurement] ?? "").trim());

    if (!size && filled.length === 0) return;

    if (!size) {
      problems.push({ rowIndex, message: "This row has measurements but no size label." });
      return;
    }

    // A duplicate label makes the chart ambiguous at exactly the moment it is used: Phase 8 maps a
    // SKU's raw size onto one of these, and two rows named `M` give two different answers.
    const key = size.toLowerCase();
    if (seen.has(key)) {
      problems.push({ rowIndex, message: `Two rows are both labelled "${size}".` });
      return;
    }
    seen.add(key);

    const record: Record<string, unknown> = { size };

    for (const { measurement, label, required } of columns) {
      const text = (row.values[measurement] ?? "").trim();

      if (!text) {
        if (required) {
          problems.push({ rowIndex, measurement, message: `${label} is needed for every size.` });
        }
        continue;
      }

      const bound = parseDraftBound(text);
      if (!bound) {
        problems.push({
          rowIndex,
          measurement,
          message: `"${text}" is not a measurement. Try 96, 96-104, or 120+.`,
        });
        continue;
      }

      if (bound.min !== null) record[`${measurement}_min`] = bound.min;
      if (bound.max !== null) record[`${measurement}_max`] = bound.max;
    }

    const chartRow = parseSizeChartRow(record, group);
    if (!chartRow) {
      problems.push({ rowIndex, message: `Nothing in the "${size}" row could be read.` });
      return;
    }

    // `parseSizeChartRow` drops a bound it finds implausible, which would otherwise turn a typo into
    // a silently missing column on a chart the merchant believes is complete.
    for (const { measurement, label } of columns) {
      const typed = (row.values[measurement] ?? "").trim();
      const kept =
        chartRow[`${measurement}_min`] !== undefined || chartRow[`${measurement}_max`] !== undefined;
      if (typed && !kept) {
        problems.push({
          rowIndex,
          measurement,
          message: `${label} of "${typed}" is outside the range a body measurement can be.`,
        });
      }
    }

    parsed.push(chartRow);
  });

  if (parsed.length === 0 && problems.length === 0) {
    problems.push({ rowIndex: 0, message: "Add at least one size before saving." });
  }

  return { rows: parsed, problems };
}
