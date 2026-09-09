import { boundsFor, SIZE_ALIAS_KEYS, type MeasurementBounds, type SizeAliasKey, type SizeChartRow } from "./chart-schema";
import { GIRTH_MEASUREMENTS, MEASUREMENTS, measurementsFor, type Measurement, type SizingGroup } from "./measurements";

/**
 * The one confidence bar in the system, as a 0-1 fraction.
 *
 * There used to be two, disagreeing: research skipped re-searching anything above 0.75, while the
 * review screen painted anything below 90 as needing a human. So every chart between the two was
 * simultaneously good enough never to be looked at again and not good enough to trust — which is
 * the worst of both, since nothing would ever revisit it.
 */
export const CHART_CONFIDENCE_THRESHOLD = 0.9;

/** The same bar on the 0-100 scale the UI displays confidence in. */
export const CHART_CONFIDENCE_PERCENT = CHART_CONFIDENCE_THRESHOLD * 100;

/**
 * Everything Stage 4's review screen derives from a stored chart: a table a human can read, and an
 * honest account of what is wrong with it.
 *
 * Pure and shared rather than computed in the component, because both halves are judgements the
 * server and the UI have to agree on — a chart the API calls sound and the table paints red is
 * worse than either verdict on its own. Keeping them here also makes the failure modes testable
 * without a database or a browser.
 */

// ─── Display table ──────────────────────────────────────────────────────────────

export interface ChartTable {
  /** `Size` first, then one column per measurement the chart actually carries. */
  headers: string[];
  /** Keyed by header, so the table renderer needs no knowledge of measurements. */
  rows: Record<string, string>[];
}

/**
 * Formats one measurement's bounds for a cell.
 *
 * The `min === max` case is rendered as the bare number rather than `"94-94"` on purpose: it is a
 * real and fairly common thing for a scrape to produce, and showing it as a range would disguise
 * the fact that the chart pins a single measurement instead of covering an interval. `assessChart`
 * flags it separately; this just refuses to hide it.
 */
export function formatBounds(bounds: MeasurementBounds | null): string {
  if (!bounds) return "—";
  const { min, max } = bounds;
  if (min !== null && max !== null) return min === max ? String(min) : `${min}-${max}`;
  // Open-ended ends are the chart's own "120+" / "up to 86" rows, which carry real information.
  if (min !== null) return `${min}+`;
  if (max !== null) return `≤${max}`;
  return "—";
}

function headerFor(measurement: Measurement): string {
  const { label, unit } = MEASUREMENTS[measurement];
  return `${label} (${unit})`;
}

/** Column headings for the parallel label systems a row carries. Short, because they sit between
 *  the size and the measurements and a merchant reads them as a strip. */
const ALIAS_HEADERS: Record<SizeAliasKey, string> = {
  alpha: "Alpha",
  eu: "EU",
  uk: "UK",
  us: "US",
  fr: "FR",
  it: "IT",
  de: "DE",
  jp: "JP",
  neck: "Collar",
  waist_inseam: "W/L",
};

/**
 * Turns stored rows into a display table: the size, the other names it goes by, then its
 * measurements.
 *
 * Only columns the chart has data for. A tops chart that came back with chest and height but no
 * waist gets two measurement columns, not three with one full of dashes — an empty column reads as
 * "this size has no waist", when the truth is the source never published one. The same rule applies
 * to the alias columns, which is what keeps a chart with no UK sizing from showing an empty UK strip.
 *
 * Aliases come before measurements because they are what a merchant recognises: their own stock says
 * `41` or `3431`, and finding that on the row is how they check the chart is the right one at all.
 */
export function chartTable(rows: SizeChartRow[], group: SizingGroup): ChartTable {
  const aliases = SIZE_ALIAS_KEYS.filter((key) => rows.some((row) => row.aliases?.[key]));
  const present = measurementsFor(group).filter((measurement) =>
    rows.some((row) => boundsFor(row, measurement) !== null)
  );

  const headers = ["Size", ...aliases.map((key) => ALIAS_HEADERS[key]), ...present.map(headerFor)];
  const tableRows = rows.map((row) => {
    const record: Record<string, string> = { Size: row.size };
    for (const key of aliases) {
      record[ALIAS_HEADERS[key]] = row.aliases?.[key] ?? "—";
    }
    for (const measurement of present) {
      record[headerFor(measurement)] = formatBounds(boundsFor(row, measurement));
    }
    return record;
  });

  return { headers, rows: tableRows };
}

// ─── Quality assessment ─────────────────────────────────────────────────────────

export type ChartQualityCode =
  | "no_bounds"
  | "point_bounds"
  | "mixed_scales"
  | "too_few_rows"
  | "no_source";

export type ChartQualitySeverity = "error" | "warning";

export interface ChartQualityFlag {
  code: ChartQualityCode;
  severity: ChartQualitySeverity;
  /** Short enough for a badge. */
  label: string;
  /** One sentence saying what it means for a shopper, for a tooltip or a detail row. */
  detail: string;
}

/**
 * Which numbering system a size label is drawn from.
 *
 * Buckets exist to catch one specific failure the first real research run produced: a single
 * "bottoms" chart holding women's jean sizes (24-28), EU menswear sizes (42-58) and German trouser
 * sizes (90-110) at once, with overlapping and contradictory waist ranges. Any one of those is a
 * valid scale; all three in one chart means the source was read as if it were one table, and
 * nothing downstream can tell which row applies to a given garment.
 *
 * The magnitude splits are deliberately wide, because the point is separating scales that cannot be
 * the same system, not classifying every label correctly. `numeric_low` tops out below the EU
 * menswear range and `numeric_high` starts above it.
 */
export type SizeScaleFamily =
  | "alpha"
  | "numeric_low"
  | "numeric_mid"
  | "numeric_high"
  | "waist_inseam"
  | "other";

/**
 * A leading digit is only allowed before an `X` run, and the trailing letter is a length line.
 *
 * `XLT` is a tall XL and `14P` a petite 14, so without the suffix a brand's tall range reads as
 * four unrecognisable labels. The digit restriction goes the other way: a kids guide labels its
 * rows `3M` and `6M` for three and six months, and an alpha size never carries a bare numeric
 * prefix — `3XL` does, `3M` does not — so allowing one made every infant chart look like it merged
 * an alpha scale into a numeric one.
 */
const ALPHA_LABEL = /^(?:[0-9]?X{1,4})?(?:S|M|L)(?:T|P)?$|^(?:ONE ?SIZE|OS|FREE)$/i;

/**
 * A four-digit run with no separator is a waist+inseam pair — this store writes `3431` for 34/31.
 * Its own family because it is two measurements in one label, so it cannot share a chart with a
 * plain waist scale even though both look numeric.
 */
const WAIST_INSEAM_LABEL = /^\d{4}$/;

export function sizeScaleFamily(label: string): SizeScaleFamily {
  const trimmed = label.trim();
  if (!trimmed) return "other";
  if (ALPHA_LABEL.test(trimmed)) return "alpha";
  if (WAIST_INSEAM_LABEL.test(trimmed)) return "waist_inseam";

  // Leading letters are stripped ("R43" is a regular-fit collar 43, "W32" a 32 waist) so a fit or
  // dimension prefix doesn't split one real scale into two families.
  const numeric = Number.parseFloat(trimmed.replace(/^[A-Za-z]+/, ""));
  if (!Number.isFinite(numeric)) return "other";

  if (numeric < 32) return "numeric_low";
  if (numeric <= 72) return "numeric_mid";
  return "numeric_high";
}

/** Distinct scale families across a chart's size labels, in first-seen order. */
export function chartSizeFamilies(rows: SizeChartRow[]): SizeScaleFamily[] {
  const seen: SizeScaleFamily[] = [];
  for (const row of rows) {
    const family = sizeScaleFamily(row.size);
    if (!seen.includes(family)) seen.push(family);
  }
  return seen;
}

/**
 * The coarser question the merged-scale check actually asks: is this chart drawn from more than one
 * *kind* of label system?
 *
 * The magnitude families above are what distinguishes women's denim (24-30) from EU menswear
 * (42-58) from German trouser sizes (90-110), and they were the right tool when one chart was asked
 * to hold a brand's entire guide. A chart is now exactly one published table, and at that grain the
 * magnitudes are no longer evidence of anything: Tommy's own women's jeans table runs 24 to 34 and
 * crosses the boundary on its own, as does every denim scale sold in inches. Flagging those as
 * merged condemned twelve correct charts in the first clean run.
 *
 * What still is evidence is a chart holding alpha labels *and* numeric ones, or either of those
 * alongside a waist/inseam pair — those are separate tables pasted together, not one scale with a
 * wide range. `other` is excluded on purpose: it means "we don't recognise this label", which is
 * not the same as "this is a different scale", and kids' guides are full of `NB` and `3M`.
 */
export type SizeScaleKind = "alpha" | "numeric" | "waist_inseam";

export function sizeScaleKinds(rows: SizeChartRow[]): SizeScaleKind[] {
  const kinds: SizeScaleKind[] = [];
  for (const family of chartSizeFamilies(rows)) {
    const kind: SizeScaleKind | null =
      family === "alpha"
        ? "alpha"
        : family === "waist_inseam"
          ? "waist_inseam"
          : family === "other"
            ? null
            : "numeric";
    if (kind && !kinds.includes(kind)) kinds.push(kind);
  }
  return kinds;
}

/**
 * Girth measurements where every row that mentions them pins a single value instead of a range.
 *
 * This is the quietest of the failure modes and the most damaging. `boundsContain` treats a size as
 * fitting only when the shopper's measurement falls inside the bounds, so `chest_min === chest_max
 * === 96` matches a shopper of exactly 96cm and nobody else. A chart whose chest column is built
 * that way excludes essentially every shopper from every size, and it does it while reporting high
 * confidence — the numbers themselves look perfectly reasonable in isolation.
 *
 * Restricted to girths, because a *length* published as one number per size is not a defect at all:
 * Tommy Hilfiger's own guide prints "SLEEVE 61, 62.5, 64" and "INSEAM 83, 84, 85", and nearly every
 * brand does the same. Flagging those was safe only while extraction was too broken to produce them;
 * once it works, an unrestricted check condemns correct charts. See `GIRTH_MEASUREMENTS`.
 */
export function pinnedMeasurements(rows: SizeChartRow[], group: SizingGroup): Measurement[] {
  return measurementsFor(group).filter((measurement) => {
    if (!GIRTH_MEASUREMENTS.has(measurement)) return false;
    const bounds = rows.map((row) => boundsFor(row, measurement)).filter((b): b is MeasurementBounds => b !== null);
    if (bounds.length === 0) return false;
    return bounds.every((b) => b.min !== null && b.max !== null && b.min === b.max);
  });
}

export interface AssessChartInput {
  rows: SizeChartRow[];
  group: SizingGroup;
  sourceUrl: string | null;
}

/**
 * Everything wrong with a chart, worst first.
 *
 * Deliberately separate from `confidence`, which is the model's own opinion of its work and has
 * proven to be no guide at all: the first real run returned 0.95 on charts with no source URL,
 * pinned height columns and three merged size scales. These flags are checks on the artifact
 * itself, so they can disagree with the model, which is the entire reason to compute them.
 */
export function assessChart({ rows, group, sourceUrl }: AssessChartInput): ChartQualityFlag[] {
  const flags: ChartQualityFlag[] = [];

  const measurements = measurementsFor(group);
  const hasAnyBound = rows.some((row) => measurements.some((m) => boundsFor(row, m) !== null));

  if (rows.length === 0 || !hasAnyBound) {
    flags.push({
      code: "no_bounds",
      severity: "error",
      label: "No measurements",
      detail:
        "The chart has size labels but no body measurements behind them, so nothing can be matched to a shopper.",
    });
    // Every other check reads those bounds, so there is nothing further to say about this chart.
    if (!sourceUrl) flags.push(noSourceFlag());
    return flags;
  }

  const pinned = pinnedMeasurements(rows, group);
  if (pinned.length > 0) {
    const names = pinned.map((m) => MEASUREMENTS[m].label.toLowerCase()).join(" and ");
    flags.push({
      code: "point_bounds",
      severity: "error",
      label: "Single values, not ranges",
      detail: `Every size pins an exact ${names} rather than covering a range, so only a shopper measuring that number to the centimetre would be matched.`,
    });
  }

  const kinds = sizeScaleKinds(rows);
  if (kinds.length > 1) {
    flags.push({
      code: "mixed_scales",
      severity: "error",
      label: "Mixed size scales",
      detail: `Size labels come from ${kinds.length} different kinds of numbering system (${describeFamilies(rows)}), so the chart merges more than one of the brand's scales and its ranges contradict each other.`,
    });
  }

  if (rows.length < 2) {
    flags.push({
      code: "too_few_rows",
      severity: "warning",
      label: "Only one size",
      detail: "A single size row cannot distinguish between sizes, so it can confirm a fit but never choose one.",
    });
  }

  if (!sourceUrl) flags.push(noSourceFlag());

  return flags;
}

function noSourceFlag(): ChartQualityFlag {
  return {
    code: "no_source",
    severity: "warning",
    label: "No source",
    detail:
      "No URL was recorded for this chart, so the numbers can't be checked against the brand's published guide.",
  };
}

/** Example labels per family, so "mixed scales" names the actual clash rather than asserting it. */
function describeFamilies(rows: SizeChartRow[]): string {
  const examples = new Map<SizeScaleFamily, string[]>();
  for (const row of rows) {
    const family = sizeScaleFamily(row.size);
    const list = examples.get(family) ?? [];
    if (list.length < 2) list.push(row.size);
    examples.set(family, list);
  }
  return [...examples.values()].map((labels) => labels.join("/")).join(" vs ");
}

/** True when a chart needs a human before it drives recommendations. */
export function hasBlockingQualityIssue(flags: ChartQualityFlag[]): boolean {
  return flags.some((flag) => flag.severity === "error");
}
