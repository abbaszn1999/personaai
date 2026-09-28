import { boundsFor } from "./chart-schema";
import {
  isBodyMeasurement,
  measurementsFor,
  requiredMeasurementsFor,
  type Measurement,
  type SizingGroup,
} from "./measurements";
import type { MatchedProductChart } from "./product-chart";

const MAX_ACS_TEXT_LENGTH = 256;
const OPEN_MIN = 0;
const OPEN_MAX = 1_000;

export interface AcsSizingEntry {
  raw: string;
  label: string;
  rowJson: string;
}

export interface AcsSizingPayload {
  chartKey: string;
  leaf: string;
  group: SizingGroup;
  audience: string;
  chartVariant: string;
  entries: AcsSizingEntry[];
  envelopes: Partial<Record<`${Measurement}_${"min" | "max"}`, number>>;
}

function rowJson(
  label: string,
  row: MatchedProductChart["sizeMatches"][number]["row"],
  group: SizingGroup,
  audience: MatchedProductChart["chart"]["audience"],
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

export function buildAcsSizingPayload(resolution: MatchedProductChart): AcsSizingPayload {
  const group = resolution.chart.sizingCategory as SizingGroup;
  const entries = resolution.sizeMatches.map((match) => ({
    raw: match.raw,
    label: match.canonical,
    rowJson: rowJson(match.canonical, match.row, group, resolution.chart.audience),
  }));

  const envelopes: AcsSizingPayload["envelopes"] = {};
  for (const measurement of requiredMeasurementsFor(group, resolution.chart.audience)) {
    if (!isBodyMeasurement(measurement)) continue;
    const bounds = resolution.sizeMatches
      .map((match) => boundsFor(match.row, measurement))
      .filter((value) => value !== null);
    if (bounds.length === 0) continue;
    envelopes[`${measurement}_min`] = Math.min(...bounds.map((value) => value.min ?? OPEN_MIN));
    envelopes[`${measurement}_max`] = Math.max(...bounds.map((value) => value.max ?? OPEN_MAX));
  }

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
