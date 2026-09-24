import type { ResearchStatus } from "@/lib/db/sizing-coverage";
import { MEASUREMENT_KEYS, MEASUREMENTS, measurementsFor, type Measurement, type SizingGroup } from "./measurements";

/**
 * One row of a size chart, in the flat `<measurement>_min` / `<measurement>_max` shape
 * `Documentation/persona_sizing.md` specifies.
 *
 * Flat rather than a nested `bounds: Record<Measurement, ...>` map for a hard technical reason:
 * OpenAI strict structured output requires `additionalProperties: false` with every property
 * named in `required`, so a JSON object with model-chosen keys cannot be expressed at all. The
 * flat shape enumerates its keys, so it can. Keeping the stored shape identical to the wire shape
 * also means a researched chart is saved exactly as it was validated, with no lossy hop in between.
 */
export type SizeChartBoundKey = `${Measurement}_min` | `${Measurement}_max`;

/**
 * The parallel label systems one row of a real size guide prints for the same body.
 *
 * A published chart almost never labels a size once. Tommy Hilfiger's men's tops table gives an
 * alpha size, a numeric equivalent, and a collar measurement on the same line; its jeans table
 * gives a waist/inseam pair; a shoe table gives EU, UK and US at once. `size` alone can hold one of
 * those, so the merchant whose stock says `41` or `3431` had nothing to match against and the
 * mapping had to be guessed. These are the same row's other names.
 *
 * A fixed key set rather than free-form, because these are what regional label systems actually
 * are, and because a closed set is something strict structured output can constrain — the reason
 * the bounds below are flat does not apply here.
 *
 * Only five systems, matching `SIZE_TYPES` in `size-types.ts`: `alpha`, `eu`, `uk`, `us`,
 * `numeric`. FR/IT/DE/JP were removed — no merchant this store connects to is labelled in them,
 * and every kept regional key already has a live merchant behind it. `numeric` is a market-neutral
 * numeric scale (a jeans waist inch, a dress size, a plain grading) as opposed to `eu`/`us`, which
 * are a country's own numeric scale — Tommy's men's jeans table prints both a US SIZE and a
 * separate Denim inch size on the same row, and only the second belongs here.
 */
export const SIZE_ALIAS_KEYS = [
  /** S / M / L / XXL, and one-size labels. */
  "alpha",
  "eu",
  "uk",
  "us",
  /** A numeric scale that is not a country's own system — a denim inch waist, a dress size, a
   *  plain grading. Kept distinct from `eu`/`us` so the same real-world scale never has to pick
   *  one of two homes depending on which other column happens to be on the table. */
  "numeric",
  /** A child's age band — `NB`, `3M`, `8-9y`. Not one of the five merchant-facing `SIZE_TYPES`
   *  (`SIZE_TYPE_ALIAS_KEYS` has no entry pointing here): no store declares its size type as
   *  "Age", and an EU-declared store's `92` must not be answered by a row's age label instead of
   *  its `eu` one. Split out because it used to be dumped into `alpha` — `3M` is not S/M/L, and a
   *  chart mixing the two meant `chartSizeFamilies` saw one scale where two real ones exist. Kids
   *  guides publish it because a body this young has no other size axis parents recognise.  */
  "age",
  /** Collar size sold as a label in its own right — a menswear shirt listed as `41`. */
  "neck",
  /** Waist+inseam as one token, printed `3431` or `34/31`. Two measurements in one label, which is
   *  why it cannot be folded into `eu` or `us` even though it looks numeric. */
  "waist_inseam",
] as const;

export type SizeAliasKey = (typeof SIZE_ALIAS_KEYS)[number];

/** Only the systems this row's source actually printed. Absent is not the same as empty: a chart
 *  that never published a UK column must not claim one. */
export type SizeAliases = Partial<Record<SizeAliasKey, string>>;

export function isSizeAliasKey(value: unknown): value is SizeAliasKey {
  return typeof value === "string" && (SIZE_ALIAS_KEYS as readonly string[]).includes(value);
}

export type SizeChartRow = { size: string; aliases?: SizeAliases } & Partial<Record<SizeChartBoundKey, number>>;

/** Every label this row answers to, `size` first, deduplicated. What Phase 6 matches a merchant's
 *  raw stock strings against before it considers spending an LLM call on the leftovers. */
export function rowLabels(row: SizeChartRow): string[] {
  const labels = [row.size, ...Object.values(row.aliases ?? {})];
  return [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
}

/**
 * The alias keys that name a country or region's scale, as opposed to describing the label some
 * other way.
 *
 * `alpha` is excluded because S/M/L is not a claim about where a size is sold — it is the same label
 * everywhere; `numeric` is excluded for the same reason it was split from `eu`/`us` in the first
 * place — a denim inch or dress size is not a claim about a market either; and `neck` and
 * `waist_inseam` are excluded because they are measurements used as labels rather than regional
 * systems. The distinction is what makes `chartLabelSystems` answerable: "which regions can this
 * chart speak to" has to mean the regional keys and nothing else.
 */
export const REGIONAL_ALIAS_KEYS = ["eu", "uk", "us"] as const satisfies readonly SizeAliasKey[];

export type RegionalAliasKey = (typeof REGIONAL_ALIAS_KEYS)[number];

/**
 * Which regional scales a chart actually carries, read off its rows.
 *
 * This replaced a stored `region` column, and the reason is worth keeping: one chart's rows routinely
 * carry EU, UK and US at once, so a single stored value could only ever name one of them. Tommy's
 * shoe table was stored as `EU` while every row also held a UK and a US size, and the badge built
 * from it told a merchant there were no US sizes in a chart full of them. A derived answer cannot
 * disagree with the rows, because it is the rows.
 *
 * Declaration order rather than first-seen, so the same set of systems always reads the same way.
 */
export function chartLabelSystems(rows: SizeChartRow[]): RegionalAliasKey[] {
  const present = new Set<string>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row.aliases ?? {})) {
      if (value?.trim()) present.add(key);
    }
  }
  return REGIONAL_ALIAS_KEYS.filter((key) => present.has(key));
}

/** The systems above as a merchant-facing string — `EU · UK · US`. Empty when a chart publishes only
 *  alpha labels, which is a real answer rather than a gap: nothing regional was printed. */
export function formatLabelSystems(rows: SizeChartRow[]): string {
  return chartLabelSystems(rows)
    .map((key) => key.toUpperCase())
    .join(" · ");
}

/** Where a chart came from, mirrored by the `provenance` check constraint on `sizing_charts`. */
export const CHART_PROVENANCES = ["research", "manual", "merchant"] as const;
export type ChartProvenance = (typeof CHART_PROVENANCES)[number];

export function isChartProvenance(value: unknown): value is ChartProvenance {
  return typeof value === "string" && (CHART_PROVENANCES as readonly string[]).includes(value);
}

/**
 * An inclusive body range for one measurement. Either end may be `null`, which means open-ended:
 * a real chart's top row is often "120+" with no upper bound, and a bottom row "up to 86" with no
 * lower one. Discarding those rows for being incomplete would drop the two sizes at the extremes,
 * which are exactly the ones a borderline shopper needs.
 */
export interface MeasurementBounds {
  min: number | null;
  max: number | null;
}

/** Reads one measurement's bounds off a row, or `null` when the chart says nothing about it. */
export function boundsFor(row: SizeChartRow, measurement: Measurement): MeasurementBounds | null {
  const min = row[`${measurement}_min`];
  const max = row[`${measurement}_max`];
  if (typeof min !== "number" && typeof max !== "number") return null;
  return { min: typeof min === "number" ? min : null, max: typeof max === "number" ? max : null };
}

/**
 * Whether a body measurement falls inside a size's range, with `slack` widening both ends.
 *
 * The single definition of that comparison, including the open-ended semantics above: a null bound
 * never excludes. Phase 8's Size Filter margins are passed in as `slack` rather than baked into the
 * chart, per the doc's rule that margins affect the exclusion filter and never `final_chart`.
 */
export function boundsContain(bounds: MeasurementBounds, value: number, slack = 0): boolean {
  if (bounds.min !== null && value < bounds.min - slack) return false;
  if (bounds.max !== null && value > bounds.max + slack) return false;
  return true;
}

/** Upper sanity bound per unit, used only to reject a chart that came back in the wrong unit
 *  (a 38-inch chest arriving as `38`, or a weight chart in lb). A human body measurement in cm
 *  never exceeds ~260, and no garment chart legitimately carries a 500cm bound. */
const MAX_PLAUSIBLE = { cm: 260, kg: 400 } as const;

function plausibleBound(measurement: Measurement, value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  if (value > MAX_PLAUSIBLE[MEASUREMENTS[measurement].unit]) return undefined;
  return Math.round(value * 10) / 10;
}

/**
 * Parses one untrusted chart row — from a model response or a jsonb column — keeping only bounds
 * that belong to this group and survive a plausibility check.
 *
 * Lenient by design, matching `parseFieldOverrides`: a single implausible bound in a 12-size chart
 * drops that bound, not the chart. Returns `null` only when the row has no usable size label,
 * since a bound with nothing to label it can never be matched to stock.
 */
export function parseSizeChartRow(value: unknown, group: SizingGroup): SizeChartRow | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  const size = typeof record.size === "string" ? record.size.trim() : "";
  if (!size) return null;

  const row: SizeChartRow = { size };

  const aliases = parseAliases(record.aliases, size);
  if (aliases) row.aliases = aliases;

  for (const measurement of measurementsFor(group)) {
    const min = plausibleBound(measurement, record[`${measurement}_min`]);
    const max = plausibleBound(measurement, record[`${measurement}_max`]);

    // An inverted pair means the source was misread, so trust neither end of it.
    if (min !== undefined && max !== undefined && min > max) continue;

    if (min !== undefined) row[`${measurement}_min`] = min;
    if (max !== undefined) row[`${measurement}_max`] = max;
  }

  return row;
}

/**
 * Keeps only known alias systems carrying a real label.
 *
 * Drops an alias equal to `size` itself: the model is asked for every label the source printed, so
 * the primary one comes back in both places, and storing it twice would make `rowLabels` and the
 * modal's alias columns both repeat it.
 */
function parseAliases(value: unknown, size: string): SizeAliases | undefined {
  if (!value || typeof value !== "object") return undefined;

  const aliases: SizeAliases = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isSizeAliasKey(key) || typeof raw !== "string") continue;
    const label = raw.trim();
    if (!label || label === size) continue;
    aliases[key] = label;
  }

  return Object.keys(aliases).length > 0 ? aliases : undefined;
}

/**
 * Parses a whole chart, dropping unusable rows and de-duplicating repeated size labels (a scraped
 * page listing "M" twice would otherwise produce two rows that resolve to different bounds
 * depending on iteration order).
 */
export function parseSizeChart(value: unknown, group: SizingGroup): SizeChartRow[] {
  if (!Array.isArray(value)) return [];

  const bySize = new Map<string, SizeChartRow>();
  for (const entry of value) {
    const row = parseSizeChartRow(entry, group);
    if (row && !bySize.has(row.size)) bySize.set(row.size, row);
  }
  return [...bySize.values()];
}

/** True when a row carries at least one usable bound — a chart of bare labels has nothing to fit
 *  against and should route to the gap queue rather than be published as covered. */
export function rowHasBounds(row: SizeChartRow, group: SizingGroup): boolean {
  return measurementsFor(group).some((measurement) => boundsFor(row, measurement) !== null);
}

export function chartHasBounds(rows: SizeChartRow[], group: SizingGroup): boolean {
  return rows.some((row) => rowHasBounds(row, group));
}

// ─── JSON Schema for structured model output ──────────────────────────────────

export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
}

/**
 * One row schema, carrying the given measurements — all of them by default.
 *
 * The earlier design built a wrapper naming each chart key the store needed as its own property,
 * which made the model responsible for routing tables to keys. That is gone: extraction returns
 * every table a brand publishes with its own `garment_group` already decided, so the schema only
 * has to describe a row.
 *
 * The measurement list is a parameter because output size turned out to be the binding constraint.
 * Strict mode requires every property in `required`, so each measurement the schema mentions costs
 * two explicit `null`s on every row that does not use it — and a brand like Tommy Hilfiger yields
 * around 270 rows. Narrowing to `measurementsFor(group)` roughly halves that, which is the
 * difference between a call that returns and one that runs out of time. Passing nothing still gives
 * the full vocabulary, for a caller that has to structure mixed groups in one request.
 *
 * Every property is `["<type>","null"]` rather than optional for the same strict-mode reason, and
 * that is also the honest encoding of an open-ended row: the chart's own "120+" is a real lower
 * bound with a null upper one, not a missing measurement.
 */
export function universalRowJsonSchema(measurements: readonly Measurement[] = MEASUREMENT_KEYS): JsonSchemaObject {
  const properties: Record<string, unknown> = {
    size: {
      type: "string",
      description:
        "The primary size label exactly as the source prints it, e.g. M, 42, 10.5, 3431. Never invented.",
    },
    aliases: {
      type: "object",
      description: "Every other label system this same row is printed under in the source.",
      properties: Object.fromEntries(
        SIZE_ALIAS_KEYS.map((key) => [
          key,
          {
            type: ["string", "null"],
            description:
              key === "numeric"
                ? "A market-neutral numeric scale printed for this row that is NOT a country's own EU/US/UK size — a denim waist inch, a dress size, a plain grading. Null if the table prints no such column."
                : key === "age"
                  ? "A child's age band printed for this row — NB, 3M, 8-9y. Not an EU/US/UK/alpha size even when it looks like one; put age labels here, never in `alpha`. Null if the source prints no age column."
                  : `This row's ${key} label, or null if the source publishes no ${key} column.`,
          },
        ])
      ),
      required: [...SIZE_ALIAS_KEYS],
      additionalProperties: false,
    },
  };
  const required = ["size", "aliases"];

  for (const measurement of measurements) {
    const { unit, label } = MEASUREMENTS[measurement];
    for (const edge of ["min", "max"] as const) {
      const key = `${measurement}_${edge}`;
      properties[key] = {
        type: ["number", "null"],
        description: `${label} ${edge === "min" ? "lower" : "upper"} bound of the wearer's body, in ${unit}. Null when the source publishes no ${label.toLowerCase()} for this row, or is open-ended at this end.`,
      };
      required.push(key);
    }
  }

  return { type: "object", properties, required, additionalProperties: false };
}

/** One `(chart key, group)` pair the store needs covered — the doc's Step 0 `categories_needed`
 *  entry. No longer sent to the model: extraction pulls everything the brand publishes and the
 *  match against what this store carries is a join we run ourselves. */
export interface CoverageRequest {
  /** Sizing key, e.g. `tops`. See `sizingCategoryFor` in keys.ts. */
  sizingCategory: string;
  group: SizingGroup;
  /** The merchant's own distinct size strings for this pair, straight off `raw_formats`. Sent to
   *  4b so that when a published table prints four parallel label columns, the one this store's
   *  stock is actually written in becomes the row's primary `size` instead of an alias. */
  rawLabels: string[];
  /** What research already concluded for this pair, so a concluded one is not searched again. */
  researchStatus: ResearchStatus;
}
