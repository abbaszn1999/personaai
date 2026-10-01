import { sizeLabelCandidates } from "@/lib/sizing/size-label-forms";
import {
  isSizingGroup,
  measurementsFor,
  requiredMeasurementsFor,
  SIZING_GROUPS,
  type Measurement,
  type SizingGroup,
} from "@/lib/sizing/measurements";
import type { CatalogCandidate } from "@/lib/retrieval/types";

/** The body measurements the shopper entered at onboarding, as the chat request carries them. */
export interface ShopperMeasurements {
  heightCm: number | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  shoeSizeEu: number | null;
}

const LIMITS: Record<keyof ShopperMeasurements, [number, number]> = {
  heightCm: [40, 250],
  chestCm: [30, 200],
  waistCm: [30, 200],
  hipsCm: [30, 200],
  shoeSizeEu: [15, 55],
};

function parseNumber(value: unknown, [min, max]: [number, number]): number | null {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number >= min && number <= max ? number : null;
}

/** Null when the request carries no usable measurement at all. */
export function parseShopperMeasurements(value: unknown): ShopperMeasurements | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const parsed = Object.fromEntries(
    (Object.keys(LIMITS) as Array<keyof ShopperMeasurements>).map((key) => [key, parseNumber(raw[key], LIMITS[key])])
  ) as unknown as ShopperMeasurements;
  return Object.values(parsed).some((entry) => entry !== null) ? parsed : null;
}

/**
 * Foot length from an EU (Paris point) shoe size: one point is 2/3 cm of last, and a last runs
 * about 1.5 cm longer than the foot it fits.
 */
export function footLengthFromEu(eu: number): number {
  return Math.round((eu * (2 / 3) - 1.5) * 10) / 10;
}

/** The shopper's measurements in the charts' own vocabulary. */
export function bodyMeasurements(measurements: ShopperMeasurements): Partial<Record<Measurement, number>> {
  const body: Partial<Record<Measurement, number>> = {};
  if (measurements.heightCm !== null) body.height = measurements.heightCm;
  if (measurements.chestCm !== null) body.chest = measurements.chestCm;
  if (measurements.waistCm !== null) body.waist = measurements.waistCm;
  if (measurements.hipsCm !== null) body.hip = measurements.hipsCm;
  if (measurements.shoeSizeEu !== null) body.foot_length = footLengthFromEu(measurements.shoeSizeEu);
  return body;
}

export function isChildShopper(audience: string | null): boolean {
  return audience?.startsWith("kids") ?? false;
}

const GROUPS = Object.keys(SIZING_GROUPS) as SizingGroup[];

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

function toleranceFor(measurement: Measurement): number {
  return FIT_TOLERANCE_CM[measurement] ?? 0;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The ACS half of the fit rule for one sizing group: the group, plus its *required* measurement
 * (chest for tops, outerwear and dresses; waist for bottoms; foot length for footwear; height for
 * every kids' group) reaching the shopper's value within `FIT_TOLERANCE_CM`. Written as range
 * overlap — `min <= value + tolerance AND max >= value - tolerance` — which is the same test for
 * a ranged size and for a one-number size.
 *
 * Other measurements (waist on a top, hips on trousers) are deliberately not sent: a chart that
 * lacks the field would fail the clause and drop out of every result. They only rank sizes, see
 * `fittingSizes`. Null when the shopper lacks the required measurement or ACS does not index its
 * field yet, so the group can never match.
 */
export function fitGroupClause(
  group: SizingGroup,
  body: Partial<Record<Measurement, number>>,
  child: boolean,
  unsupportedFields: ReadonlySet<string> = new Set()
): string | null {
  const required = requiredMeasurementsFor(group, child ? "kids" : undefined);
  if (required.length === 0) return null;
  const clauses = [`attributes.fit_group: ANY("${group}")`];
  for (const measurement of required) {
    const value = body[measurement];
    const minField = `attributes.fit_${measurement}_min`;
    const maxField = `attributes.fit_${measurement}_max`;
    if (value === undefined || unsupportedFields.has(minField) || unsupportedFields.has(maxField)) return null;
    const tolerance = toleranceFor(measurement);
    clauses.push(`${minField}: IN(*, ${round(value + tolerance)}i)`, `${maxField}: IN(${round(value - tolerance)}i, *)`);
  }
  return `(${clauses.join(" AND ")})`;
}

/** Every sizing group's `fitGroupClause` the shopper has measurements for, joined with OR. An
 *  empty string means nothing can fit. */
export function fitFilterClause(
  body: Partial<Record<Measurement, number>>,
  child: boolean,
  unsupportedFields: ReadonlySet<string> = new Set()
): string {
  return GROUPS.map((group) => fitGroupClause(group, body, child, unsupportedFields))
    .filter((clause): clause is string => clause !== null)
    .join(" OR ");
}

interface FitRow {
  s?: unknown;
  [measurement: string]: unknown;
}

function parseRow(value: string): FitRow | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as FitRow) : null;
  } catch {
    return null;
  }
}

type Bounds = [number | null, number | null];

function boundsOf(row: FitRow, measurement: string): Bounds | null {
  const bounds = row[measurement];
  if (!Array.isArray(bounds) || bounds.length !== 2) return null;
  const [min, max] = bounds.map((value) => (typeof value === "number" ? value : null)) as Bounds;
  return min === null && max === null ? null : [min, max];
}

/** How far `value` lies outside the bounds (0 inside) and how far from their middle. */
function distances(bounds: Bounds, value: number): { outside: number; middle: number } {
  const [min, max] = bounds;
  const outside = min !== null && value < min ? min - value : max !== null && value > max ? value - max : 0;
  const centre = min !== null && max !== null ? (min + max) / 2 : (min ?? max)!;
  return { outside, middle: Math.abs(value - centre) };
}

interface RowFit {
  /** Distance outside the required ranges, then outside the optional ones, then from the middle. */
  outside: number;
  optionalOutside: number;
  middle: number;
  centre: number;
}

/**
 * Whether a chart row's required measurement reaches the shopper within tolerance — the same
 * overlap the ACS clause applies to the whole product — and how well it fits, for ranking.
 */
function rowFit(
  row: FitRow,
  group: SizingGroup,
  body: Partial<Record<Measurement, number>>,
  child: boolean
): RowFit | null {
  const required = requiredMeasurementsFor(group, child ? "kids" : undefined);
  const fit: RowFit = { outside: 0, optionalOutside: 0, middle: 0, centre: 0 };
  let compared = 0;
  for (const measurement of required) {
    const value = body[measurement];
    const bounds = boundsOf(row, measurement);
    if (value === undefined || !bounds) return null;
    const tolerance = toleranceFor(measurement);
    const [min, max] = bounds;
    if (min !== null && min > round(value + tolerance)) return null;
    if (max !== null && max < round(value - tolerance)) return null;
    const { outside, middle } = distances(bounds, value);
    fit.outside += outside;
    fit.middle += middle;
    fit.centre += min !== null && max !== null ? (min + max) / 2 : (min ?? max)!;
    compared += 1;
  }
  if (compared === 0) return null;
  for (const measurement of measurementsFor(group, child ? "kids" : undefined)) {
    if (required.includes(measurement)) continue;
    const value = body[measurement];
    const bounds = boundsOf(row, measurement);
    if (value !== undefined && bounds) fit.optionalOutside += distances(bounds, value).outside;
  }
  return fit;
}

function sameSize(left: string, right: string): boolean {
  const forms = new Set(sizeLabelCandidates(right));
  return sizeLabelCandidates(left).some((form) => forms.has(form));
}

/**
 * The sizes among a product's chart rows (one JSON string each) that fit the shopper, best first.
 * A row fits when its required measurement is within `FIT_TOLERANCE_CM` of the shopper's value.
 * Best means: inside the range rather than merely within tolerance, then the optional
 * measurements (waist on a top, hips on trousers) inside their ranges, then closest to the
 * middle of the range, and a tie goes to the bigger size.
 */
export function fitRowSizes(
  rows: readonly string[],
  group: SizingGroup,
  body: Partial<Record<Measurement, number>>,
  child = false,
  named: readonly string[] = []
): string[] {
  const fitting: Array<{ size: string; fit: RowFit }> = [];
  for (const value of rows) {
    const row = parseRow(value);
    if (!row || typeof row.s !== "string" || !row.s.trim()) continue;
    const size = row.s;
    if (named.length > 0 && !named.some((wanted) => sameSize(wanted, size))) continue;
    if (fitting.some((entry) => sameSize(entry.size, size))) continue;
    const fit = rowFit(row, group, body, child);
    if (fit) fitting.push({ size, fit });
  }
  const EPSILON = 1e-9;
  fitting.sort(
    (a, b) =>
      (Math.abs(a.fit.outside - b.fit.outside) > EPSILON ? a.fit.outside - b.fit.outside : 0) ||
      (Math.abs(a.fit.optionalOutside - b.fit.optionalOutside) > EPSILON
        ? a.fit.optionalOutside - b.fit.optionalOutside
        : 0) ||
      (Math.abs(a.fit.middle - b.fit.middle) > EPSILON ? a.fit.middle - b.fit.middle : 0) ||
      b.fit.centre - a.fit.centre
  );
  return fitting.map((entry) => entry.size);
}

/**
 * The in-stock sizes of this product that fit the shopper, best first. Only stocked sizes are
 * indexed with a row, so an empty result means no size the store can sell fits, even when ACS
 * returned the product because its all-sizes range reaches the shopper. `named` narrows to the
 * sizes the shopper asked for.
 */
export function fittingSizes(
  candidate: CatalogCandidate,
  body: Partial<Record<Measurement, number>>,
  named: readonly string[] = [],
  child = false
): string[] {
  const group = candidate.attributes?.fit_group?.[0];
  if (!isSizingGroup(group)) return [];
  return fitRowSizes(candidate.attributes?.fit_rows ?? [], group, body, child, named);
}

/** How the fit rule reads in an honest "nothing matched" reply. */
export function describeFit(body: Partial<Record<Measurement, number>>): string {
  const parts: string[] = [];
  if (body.chest !== undefined) parts.push(`chest ${body.chest} cm`);
  if (body.waist !== undefined) parts.push(`waist ${body.waist} cm`);
  if (body.hip !== undefined) parts.push(`hips ${body.hip} cm`);
  if (body.height !== undefined) parts.push(`height ${body.height} cm`);
  if (body.foot_length !== undefined) parts.push(`foot ${body.foot_length} cm`);
  return `fits the shopper's measurements (${parts.join(", ")}) in an in-stock size`;
}
