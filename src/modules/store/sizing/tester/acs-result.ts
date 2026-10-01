import type { FitSearchProductDto } from "@/lib/catalog/acs/fit-search";
import { sizeLabelCandidates } from "@/lib/sizing/size-label-forms";
import {
  measurementsFor,
  requiredMeasurementsFor,
  type Measurement,
  type SizingGroup,
} from "@/lib/sizing/measurements";
import type { Audience } from "@/lib/sizing/keys";
import type { MultiSystemRow, TesterBrand, TesterPersona } from "./options";

/** The sliders on the left of the Sizing Tester, all in cm. */
export interface TesterMeasurements {
  adultChest: number;
  adultWaist: number;
  adultHips: number;
  adultFootLength: number;
  kidHeight: number;
  kidChest: number;
  kidWaist: number;
  kidHips: number;
  kidFootLength: number;
}

/** What `GET /api/store-connection/sizing/tester/products` answers. */
export interface TesterSearchResponse {
  products: FitSearchProductDto[];
  /** Hits ACS returned across the pages read (variants count separately). */
  hitCount: number;
  /** ACS's own total for the filter. */
  totalSize: number | null;
  pages: number;
  /** More pages exist than were read. */
  truncated: boolean;
  outOfScope: number;
  /** The caller-controlled half of the ACS filter that was sent. */
  filter: string;
  tolerances: Array<{ measurement: Measurement; value: number; tolerance: number }>;
  error?: string;
}

const QUERY_KEY: Partial<Record<Measurement, string>> = {
  chest: "chest",
  waist: "waist",
  hip: "hip",
  height: "height",
  foot_length: "footLength",
};

/** The request the Found Sizes button sends: the chart being tested and the body measurements
 *  that apply to its garment group. Anything that does not apply is left out, because the route
 *  rejects it. */
export function testerSearchParams(input: {
  brand: TesterBrand;
  group: SizingGroup;
  audience: Audience;
  chartVariant: string;
  persona: TesterPersona;
  measurements: TesterMeasurements;
}): URLSearchParams {
  const { measurements } = input;
  const body: Partial<Record<Measurement, number>> = input.persona === "kid"
    ? {
        height: measurements.kidHeight,
        chest: measurements.kidChest,
        waist: measurements.kidWaist,
        hip: measurements.kidHips,
        foot_length: measurements.kidFootLength,
      }
    : {
        chest: measurements.adultChest,
        waist: measurements.adultWaist,
        hip: measurements.adultHips,
        foot_length: measurements.adultFootLength,
      };

  const params = new URLSearchParams({
    fitGroup: input.group,
    fitAudience: input.audience,
    chartVariant: input.chartVariant,
  });
  if (input.brand.coverageType === "none") params.append("brand", "__none__");
  else for (const name of input.brand.sourceBrandNames) params.append("brand", name);

  const applicable = new Set(measurementsFor(input.group, input.audience));
  for (const [measurement, value] of Object.entries(body) as Array<[Measurement, number]>) {
    const key = QUERY_KEY[measurement];
    if (key && applicable.has(measurement)) params.set(key, String(value));
  }
  return params;
}

function formsOf(label: string): Set<string> {
  return new Set(sizeLabelCandidates(label));
}

function sameSize(left: string, right: string): boolean {
  const forms = formsOf(right);
  return sizeLabelCandidates(left).some((form) => forms.has(form));
}

type Bounds = [number | undefined, number | undefined];

function decidingBounds(row: MultiSystemRow, measurement: Measurement): Bounds {
  switch (measurement) {
    case "chest":
      return [row.chestMin, row.chestMax];
    case "waist":
      return [row.waistMin, row.waistMax];
    case "height":
      return [row.heightMin, row.heightMax];
    case "foot_length":
      return [row.footLengthMin, row.footLengthMax];
    default:
      return [undefined, undefined];
  }
}

/** Whether ACS's product has this chart size in stock and within tolerance of the shopper. */
export function productFitsSize(product: Pick<FitSearchProductDto, "fitSizes">, sizeLabel: string): boolean {
  return product.fitSizes.some((size) => sameSize(size, sizeLabel));
}

export interface SearchSummary {
  /** Per chart row: how many ACS-returned products have that size in stock and within tolerance. */
  counts: number[];
  /** The matched row closest to the shopper's value on the deciding measurement, or -1. */
  bestIndex: number;
}

/**
 * Reads ACS's answer against the chart being tested. ACS decides which products come back;
 * each product's own chart rows say which of its sizes sit within tolerance (the same rule the
 * Persona agent uses). The best row is only chosen among rows ACS actually produced products
 * for: inside the range wins over merely within tolerance, then the closest range middle, and a
 * tie goes to the bigger size.
 */
export function summarizeSearch(
  rows: readonly MultiSystemRow[],
  group: SizingGroup,
  audience: Audience,
  value: Partial<Record<Measurement, number>>,
  products: readonly FitSearchProductDto[],
): SearchSummary {
  const counts = rows.map((row) => products.filter((product) => productFitsSize(product, row.sizeLabel)).length);

  const [measurement] = requiredMeasurementsFor(group, audience);
  const target = measurement === undefined ? undefined : value[measurement];
  let bestIndex = -1;
  if (measurement === undefined || target === undefined) return { counts, bestIndex };

  let best: { outside: number; middle: number; centre: number } | null = null;
  rows.forEach((row, index) => {
    if (counts[index] === 0) return;
    const [min, max] = decidingBounds(row, measurement);
    if (min === undefined && max === undefined) return;
    const outside = min !== undefined && target < min ? min - target : max !== undefined && target > max ? target - max : 0;
    const centre = min !== undefined && max !== undefined ? (min + max) / 2 : (min ?? max)!;
    const candidate = { outside, middle: Math.abs(target - centre), centre };
    const better =
      best === null ||
      candidate.outside < best.outside - 1e-9 ||
      (Math.abs(candidate.outside - best.outside) <= 1e-9 &&
        (candidate.middle < best.middle - 1e-9 ||
          (Math.abs(candidate.middle - best.middle) <= 1e-9 && candidate.centre > best.centre)));
    if (better) {
      best = candidate;
      bestIndex = index;
    }
  });
  return { counts, bestIndex };
}
