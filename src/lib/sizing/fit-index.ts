import type { Measurement } from "./measurements";

/**
 * The one fit tolerance, in cm, for the measurements a size is decided on. A shopper at 95 cm
 * chest fits everything whose chart range reaches anywhere between 93 and 97, whether the brand
 * publishes ranges (92-96) or one nominal number per size (97). Both the Persona agent and the
 * Sizing Tester build their ACS filter from this table, so the tester shows exactly what a
 * shopper gets.
 *
 * Chest, waist and foot length are the adult measurements. These are design choices, not an
 * industry standard: no ISO/ASTM standard defines a body-to-chart matching tolerance, so they
 * sit below half of the usual 4 cm chest/waist grade step and below half of a Mondopoint step
 * (0.5 cm). Height is used for kids only and is not tuned yet.
 */
export const FIT_TOLERANCE_CM: Partial<Record<Measurement, number>> = {
  chest: 2,
  waist: 2,
  foot_length: 0.3,
  height: 5,
};

/**
 * ACS cannot filter inside a product's list of size rows, and a single min/max envelope across
 * sizes would also match the gaps between stocked sizes. So each size-deciding measurement is
 * published as a list of the exact values its in-stock sizes cover (`fit_chest_cm: ["93", "94",
 * ...]`), and the filter asks for the values within tolerance of the shopper (`ANY(...)`).
 *
 * Writer (`map-product.ts`) and reader (`fitGroupClause`) both go through this module, so the
 * attribute names, step sizes and rounding can never drift apart.
 */
export const FIT_INDEXED_MEASUREMENTS = ["chest", "waist", "height", "foot_length"] as const;
export type FitIndexedMeasurement = (typeof FIT_INDEXED_MEASUREMENTS)[number];

interface FitIndexSpec {
  attribute: string;
  /** Distance between two listed values, in tenths of a cm (10 = 1 cm, 1 = 0.1 cm). */
  stepTenths: number;
  /**
   * Plausible range for a body measurement, in cm. An open-ended chart row (no upper bound) lists
   * values up to the edge, which keeps every list well under ACS's 400-values-per-attribute cap.
   */
  domain: readonly [number, number];
}

export const FIT_INDEX: Record<FitIndexedMeasurement, FitIndexSpec> = {
  chest: { attribute: "fit_chest_cm", stepTenths: 10, domain: [30, 200] },
  waist: { attribute: "fit_waist_cm", stepTenths: 10, domain: [30, 200] },
  height: { attribute: "fit_height_cm", stepTenths: 10, domain: [40, 250] },
  foot_length: { attribute: "fit_foot_length_cm", stepTenths: 1, domain: [8, 36] },
};

export const FIT_INDEX_ATTRIBUTES: readonly string[] = FIT_INDEXED_MEASUREMENTS.map(
  (measurement) => FIT_INDEX[measurement].attribute,
);

export function isFitIndexed(measurement: Measurement): measurement is FitIndexedMeasurement {
  return (FIT_INDEXED_MEASUREMENTS as readonly string[]).includes(measurement);
}

/** The custom-attribute key a product record carries, e.g. `fit_chest_cm`. */
export function fitValueAttribute(measurement: FitIndexedMeasurement): string {
  return FIT_INDEX[measurement].attribute;
}

/** The path a search filter names, e.g. `attributes.fit_chest_cm`. */
export function fitValueField(measurement: FitIndexedMeasurement): string {
  return `attributes.${FIT_INDEX[measurement].attribute}`;
}

/** Integer tenths of a cm: exact, so step arithmetic never meets a float like 25.199999. */
function tenths(value: number): number {
  return Math.round(value * 10);
}

function valuesBetween(
  measurement: FitIndexedMeasurement,
  lowTenths: number,
  highTenths: number,
): string[] {
  const { stepTenths, domain } = FIT_INDEX[measurement];
  const first = Math.max(Math.floor(lowTenths / stepTenths), (domain[0] * 10) / stepTenths);
  const last = Math.min(Math.ceil(highTenths / stepTenths), (domain[1] * 10) / stepTenths);
  const values: string[] = [];
  for (let unit = first; unit <= last; unit += 1) {
    values.push(stepTenths === 10 ? String(unit) : (unit / 10).toFixed(1));
  }
  return values;
}

/**
 * Every value one chart row covers. A bound is rounded outward (down for the minimum, up for the
 * maximum) so a row can only ever list too much, never too little; `fit_rows` is the exact check
 * afterwards. A missing bound is open-ended up to the edge of the measurement's domain.
 */
export function rowValues(
  measurement: FitIndexedMeasurement,
  min: number | null,
  max: number | null,
): string[] {
  const { domain } = FIT_INDEX[measurement];
  return valuesBetween(
    measurement,
    min === null ? domain[0] * 10 : tenths(min),
    max === null ? domain[1] * 10 : tenths(max),
  );
}

/**
 * Every value within tolerance of the shopper's measurement, the list a search filter asks ACS
 * for. Empty when the window lies wholly outside the measurement's domain.
 */
export function shopperValues(measurement: FitIndexedMeasurement, value: number): string[] {
  const tolerance = FIT_TOLERANCE_CM[measurement] ?? 0;
  return valuesBetween(measurement, tenths(value - tolerance), tenths(value + tolerance));
}
