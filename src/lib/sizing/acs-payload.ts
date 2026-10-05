import { boundsFor, preferredAliasLabel } from "./chart-schema";
import {
  isBodyMeasurement,
  isChildAudience,
  measurementsFor,
  requiredMeasurementsFor,
  type Measurement,
  type SizingGroup,
} from "./measurements";
import type { MatchedProductChart } from "./product-chart";
import type { SizeChartRow } from "./chart-schema";

const MAX_ACS_TEXT_LENGTH = 256;
const OPEN_MIN = 0;
const OPEN_MAX = 1_000;

export type AcsEnvelopeDimension = Measurement | "age_months";
export type AcsSizingEnvelopes = Partial<
  Record<`${AcsEnvelopeDimension}_${"min" | "max"}`, number>
>;

export interface AcsSizingEntry {
  raw: string;
  label: string;
  rowJson: string;
  /** Numeric values for this one exact size row. Kept out of ACS itself; the product mapper uses
   *  it to build either a PRIMARY aggregate or a VARIANT-specific envelope after size narrowing. */
  envelopes?: AcsSizingEnvelopes;
}

export interface AcsSizingPayload {
  chartKey: string;
  leaf: string;
  group: SizingGroup;
  audience: string;
  chartVariant: string;
  entries: AcsSizingEntry[];
  envelopes: AcsSizingEnvelopes;
}

function rowJson(
  label: string,
  row: MatchedProductChart["sizeMatches"][number]["row"],
  group: SizingGroup,
  audience: MatchedProductChart["chart"]["audience"],
  ageBounds: { min: number; max: number } | null,
): string {
  const required = new Set(requiredMeasurementsFor(group, audience));
  const optional = measurementsFor(group, audience).filter(
    (measurement) => isBodyMeasurement(measurement) && !required.has(measurement),
  );
  const ordered = [
    ...requiredMeasurementsFor(group, audience).filter(isBodyMeasurement),
    ...optional,
  ];
  const payload: Record<string, string | [number | null, number | null]> = { s: label };
  if (ageBounds) payload.age_months = [ageBounds.min, ageBounds.max];
  for (const measurement of ordered) {
    const bounds = boundsFor(row, measurement);
    if (bounds) payload[measurement] = [bounds.min, bounds.max];
  }

  let serialized = JSON.stringify(payload);
  while (serialized.length > MAX_ACS_TEXT_LENGTH && optional.length > 0) {
    delete payload[optional.pop()!];
    serialized = JSON.stringify(payload);
  }
  return serialized.slice(0, MAX_ACS_TEXT_LENGTH);
}

function ageRowKey(row: SizeChartRow): string {
  return `${row.size}\u0000${preferredAliasLabel(row.aliases?.age) ?? ""}`;
}

/**
 * Converts the human labels brands publish into an ACS-comparable month interval.
 *
 * A single year label (`8y`) means the child's eighth year. A range (`8-9y`, or the unit-less
 * `3-4` used by Penti) includes both named years. Infant labels (`3M`, `6M`) are upper-bound
 * buckets, so their lower bound follows the previous month bucket in the source chart.
 */
function ageBoundsForRows(rows: readonly SizeChartRow[]): Map<string, { min: number; max: number }> {
  const result = new Map<string, { min: number; max: number }>();
  let previousInfantMonth = 0;

  for (const row of rows) {
    const raw = preferredAliasLabel(row.aliases?.age)?.trim().toLowerCase();
    if (!raw) continue;

    let bounds: { min: number; max: number } | null = null;
    const monthRange = raw.match(/^(\d+)\s*[-–]\s*(\d+)\s*(?:m|mo|mos|month|months)$/);
    const yearRange = raw.match(/^(\d+)\s*[-–]\s*(\d+)\s*(?:y|yr|yrs|year|years)?$/);
    const monthEnd = raw.match(/^(\d+)\s*(?:m|mo|mos|month|months)$/);
    const year = raw.match(/^(\d+)\s*(?:y|yr|yrs|year|years)$/);

    if (monthRange) {
      bounds = { min: Number(monthRange[1]), max: Number(monthRange[2]) };
      previousInfantMonth = bounds.max;
    } else if (yearRange) {
      bounds = {
        min: Number(yearRange[1]) * 12,
        max: (Number(yearRange[2]) + 1) * 12 - 1,
      };
    } else if (monthEnd) {
      const max = Number(monthEnd[1]);
      bounds = { min: Math.min(previousInfantMonth + 1, max), max };
      previousInfantMonth = max;
    } else if (year) {
      const start = Number(year[1]) * 12;
      bounds = { min: start, max: start + 11 };
    } else if (raw === "nb" || raw === "newborn" || raw.startsWith("pre")) {
      bounds = { min: 0, max: 0 };
    }

    if (bounds) result.set(ageRowKey(row), bounds);
  }
  return result;
}

function rowEnvelopes(
  row: SizeChartRow,
  group: SizingGroup,
  audience: MatchedProductChart["chart"]["audience"],
  ageBounds: { min: number; max: number } | null,
): AcsSizingEnvelopes {
  const envelopes: AcsSizingEnvelopes = {};
  for (const measurement of measurementsFor(group, audience)) {
    if (!isBodyMeasurement(measurement)) continue;
    const bounds = boundsFor(row, measurement);
    if (!bounds) continue;
    envelopes[`${measurement}_min`] = bounds.min ?? OPEN_MIN;
    envelopes[`${measurement}_max`] = bounds.max ?? OPEN_MAX;
  }
  if (ageBounds) {
    envelopes.age_months_min = ageBounds.min;
    envelopes.age_months_max = ageBounds.max;
  }
  return envelopes;
}

export function sizingEnvelopesForEntries(
  entries: readonly AcsSizingEntry[],
  fallback: AcsSizingEnvelopes = {},
): AcsSizingEnvelopes {
  const withEnvelopes = entries.filter((entry) => entry.envelopes);
  if (withEnvelopes.length === 0) return fallback;

  const result: AcsSizingEnvelopes = {};
  for (const entry of withEnvelopes) {
    for (const [key, value] of Object.entries(entry.envelopes ?? {})) {
      if (typeof value !== "number") continue;
      const typedKey = key as keyof AcsSizingEnvelopes;
      const current = result[typedKey];
      result[typedKey] = current === undefined
        ? value
        : key.endsWith("_min")
          ? Math.min(current, value)
          : Math.max(current, value);
    }
  }
  return result;
}

export function buildAcsSizingPayload(resolution: MatchedProductChart): AcsSizingPayload {
  const group = resolution.chart.sizingCategory as SizingGroup;
  const ageBoundsByRow = isChildAudience(resolution.chart.audience)
    ? ageBoundsForRows(resolution.chart.chartRows)
    : new Map<string, { min: number; max: number }>();
  const entries = resolution.sizeMatches.map((match) => {
    const ageBounds = ageBoundsByRow.get(ageRowKey(match.row)) ?? null;
    return {
      raw: match.raw,
      label: match.canonical,
      rowJson: rowJson(match.canonical, match.row, group, resolution.chart.audience, ageBounds),
      envelopes: rowEnvelopes(match.row, group, resolution.chart.audience, ageBounds),
    };
  });
  const envelopes = sizingEnvelopesForEntries(entries);

  return {
    chartKey: resolution.chartKey,
    leaf: resolution.leafKey,
    group,
    audience: resolution.chart.audience,
    chartVariant: resolution.chart.variantName,
    entries,
    envelopes,
  };
}
