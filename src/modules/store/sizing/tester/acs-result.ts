import { fitRowSizes, FIT_TOLERANCE_CM } from "@/lib/agents/shared/fit";
import type { FitSearchProductDto } from "@/lib/catalog/acs/fit-search";
import { boundsFor } from "@/lib/sizing/chart-schema";
import type { Audience } from "@/lib/sizing/keys";
import {
  isBodyMeasurement,
  isChildAudience,
  isMeasurement,
  measurementsFor,
  requiredMeasurementsFor,
  type Measurement,
  type SizingGroup,
} from "@/lib/sizing/measurements";
import { sizeLabelCandidates } from "@/lib/sizing/size-label-forms";
import {
  targetMeasurements,
  targetRequiredMeasurements,
  type SizingTarget,
} from "@/lib/sizing/sizing-target";
import { formatLeafLabel, PERSONA_DEPARTMENTS } from "@/modules/store/mapping/persona-taxonomy";
import type { BrandCategory, BrandSubCategory, MultiSystemRow, TesterBrand } from "./options";

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

/** What `GET /api/store-connection/sizing/tester/products` answers for one category. */
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
  /** The body measurements the request carried. */
  measurements: Partial<Record<Measurement, number>>;
  /** The Persona departments the request was scoped to. */
  departments: string[];
  /** Set only when ACS answered with nothing: how many sized, in-stock products of this category
   *  the brand has for this target at all (same filter without the measurements). */
  categoryProducts?: number | null;
  error?: string;
}

const QUERY_KEY: Partial<Record<Measurement, string>> = {
  chest: "chest",
  waist: "waist",
  hip: "hip",
  height: "height",
  foot_length: "footLength",
};

/** One garment category the selected brand has charts in for the target, and those charts. */
export interface CategoryPlan {
  category: BrandCategory;
  charts: BrandSubCategory[];
}

/** The categories Found Sizes asks ACS about for this brand and target: one request each. */
export function brandCategoriesFor(brand: TesterBrand, target: SizingTarget): CategoryPlan[] {
  return brand.categories.flatMap((category) => {
    const charts = category.subcategories.filter((chart) => (chart.rowsByPersona[target]?.length ?? 0) > 0);
    return charts.length > 0 ? [{ category, charts }] : [];
  });
}

/** The body the tester holds for this target, in the charts' vocabulary. */
export function testerBody(target: SizingTarget, measurements: TesterMeasurements): Partial<Record<Measurement, number>> {
  return target === "kid"
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
}

/** The measurements one category's request carries: those its charts can hold for this target. */
export function categoryBody(
  group: SizingGroup,
  target: SizingTarget,
  measurements: TesterMeasurements,
): Partial<Record<Measurement, number>> {
  const applicable = new Set(targetMeasurements(group, target));
  return Object.fromEntries(
    Object.entries(testerBody(target, measurements)).filter(
      ([measurement]) => applicable.has(measurement as Measurement) && QUERY_KEY[measurement as Measurement] !== undefined,
    ),
  );
}

/** The request Found Sizes sends for one category of the brand. Measurements the category cannot
 *  use are left out, because the route rejects them. */
export function testerSearchParams(input: {
  brand: TesterBrand;
  group: SizingGroup;
  target: SizingTarget;
  measurements: TesterMeasurements;
}): URLSearchParams {
  const params = new URLSearchParams({ target: input.target, fitGroup: input.group });
  if (input.brand.coverageType === "none") params.append("brand", "__none__");
  else for (const name of input.brand.sourceBrandNames) params.append("brand", name);
  for (const [measurement, value] of Object.entries(categoryBody(input.group, input.target, input.measurements))) {
    params.set(QUERY_KEY[measurement as Measurement]!, String(value));
  }
  return params;
}

/** The filtering measurement(s) of a category with their tolerance, as the request will send them. */
export function categoryFilterPreview(
  group: SizingGroup,
  target: SizingTarget,
  measurements: TesterMeasurements,
): Array<{ measurement: Measurement; value: number; tolerance: number }> {
  const body = categoryBody(group, target, measurements);
  return targetRequiredMeasurements(group, target).flatMap((measurement) => {
    const value = body[measurement];
    return value === undefined ? [] : [{ measurement, value, tolerance: FIT_TOLERANCE_CM[measurement] ?? 0 }];
  });
}

/** Which of the brand's categories a measurement filters, and which it only helps rank sizes in. */
export function measurementRole(
  measurement: Measurement,
  target: SizingTarget,
  groups: readonly SizingGroup[],
): { filters: SizingGroup[]; ranks: SizingGroup[] } {
  const filters = groups.filter((group) => targetRequiredMeasurements(group, target).includes(measurement));
  const ranks = groups.filter(
    (group) =>
      !filters.includes(group) &&
      QUERY_KEY[measurement] !== undefined &&
      targetMeasurements(group, target).includes(measurement),
  );
  return { filters, ranks };
}

type Bounds = [number | null, number | null];

const FIELD_BOUNDS: Partial<Record<Measurement, (row: MultiSystemRow) => [number | undefined, number | undefined]>> = {
  chest: (row) => [row.chestMin, row.chestMax],
  waist: (row) => [row.waistMin, row.waistMax],
  hip: (row) => [row.hipsMin, row.hipsMax],
  height: (row) => [row.heightMin, row.heightMax],
  foot_length: (row) => [row.footLengthMin, row.footLengthMax],
};

/** A chart row's bounds for one measurement, from the stored row when the option carries it. */
export function rowBounds(row: MultiSystemRow, measurement: Measurement): Bounds | null {
  if (row.chartRow) {
    const bounds = boundsFor(row.chartRow, measurement);
    return bounds ? [bounds.min, bounds.max] : null;
  }
  const read = FIELD_BOUNDS[measurement];
  if (!read) return null;
  const [min, max] = read(row);
  if (min === undefined && max === undefined) return null;
  return [min ?? null, max ?? null];
}

export type ChartRowFit = "inside" | "near" | null;

/**
 * How each row of the chart itself relates to the shopper on the category's filtering measurement,
 * using the same tolerance ACS was sent: "inside" the range, "near" (within tolerance), or null.
 * It says which size the chart points to even when ACS has no stocked product in it.
 */
export function chartRowFits(
  rows: readonly MultiSystemRow[],
  group: SizingGroup,
  audience: Audience,
  tolerances: TesterSearchResponse["tolerances"],
): ChartRowFit[] {
  const [measurement] = requiredMeasurementsFor(group, audience);
  const entry = tolerances.find((item) => item.measurement === measurement);
  if (measurement === undefined || !entry) return rows.map(() => null);
  return rows.map((row) => {
    const bounds = rowBounds(row, measurement);
    if (!bounds) return null;
    const low = bounds[0] ?? bounds[1]!;
    const high = bounds[1] ?? bounds[0]!;
    if (entry.value >= low && entry.value <= high) return "inside";
    return low <= entry.value + entry.tolerance && high >= entry.value - entry.tolerance ? "near" : null;
  });
}

interface ParsedFitRow {
  s: string;
  bounds: Array<[Measurement, Bounds]>;
}

function asBound(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseFitRow(value: string): ParsedFitRow | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object" || typeof parsed.s !== "string") return null;
    const bounds: Array<[Measurement, Bounds]> = [];
    for (const [key, entry] of Object.entries(parsed)) {
      if (!isMeasurement(key) || !Array.isArray(entry) || entry.length !== 2) continue;
      bounds.push([key, [asBound(entry[0]), asBound(entry[1])]]);
    }
    return bounds.length > 0 ? { s: parsed.s, bounds } : null;
  } catch {
    return null;
  }
}

function rowLabels(row: MultiSystemRow): string[] {
  return [row.sizeLabel, row.usSize, row.euSize, row.ukSize].filter((label): label is string => Boolean(label));
}

/**
 * Which row of this chart each of the product's indexed rows is. An indexed row carries the exact
 * bounds of the chart row it was built from, so bounds decide; the label only breaks a tie between
 * rows with identical bounds. Keyed by the indexed label, which is what `fitSizes` lists.
 */
export function matchProductRows(
  product: Pick<FitSearchProductDto, "fitRows">,
  rows: readonly MultiSystemRow[],
): Map<string, number> {
  const matched = new Map<string, number>();
  for (const raw of product.fitRows) {
    const fitRow = parseFitRow(raw);
    if (!fitRow) continue;
    const candidates = rows.flatMap((row, index) =>
      fitRow.bounds.every(([measurement, [min, max]]) => {
        const own = rowBounds(row, measurement);
        return own !== null && own[0] === min && own[1] === max;
      })
        ? [index]
        : [],
    );
    if (candidates.length === 0) continue;
    const forms = new Set(sizeLabelCandidates(fitRow.s));
    const labelled = candidates.find((index) =>
      rowLabels(rows[index]!).some((label) => sizeLabelCandidates(label).some((form) => forms.has(form))),
    );
    matched.set(fitRow.s, labelled ?? candidates[0]!);
  }
  return matched;
}

export interface ChartAssignment {
  chartId: string;
  /** Indexed size label → row index in that chart. */
  rowBySize: Map<string, number>;
}

/**
 * The chart that sized this product, among the category's charts for the target: the one all of
 * its indexed rows belong to, preferring a chart that covers the product's Persona leaf, then the
 * one most of its rows belong to. Null when no chart holds any of its rows.
 */
export function assignChart(
  product: Pick<FitSearchProductDto, "fitRows" | "leafKey">,
  charts: readonly BrandSubCategory[],
  target: SizingTarget,
): ChartAssignment | null {
  const total = new Set(product.fitRows.flatMap((raw) => parseFitRow(raw)?.s ?? [])).size;
  let best: { assignment: ChartAssignment; full: number; covers: number } | null = null;
  for (const chart of charts) {
    const rowBySize = matchProductRows(product, chart.rowsByPersona[target] ?? []);
    if (rowBySize.size === 0) continue;
    const candidate = {
      assignment: { chartId: chart.id, rowBySize },
      full: rowBySize.size === total ? 1 : 0,
      covers: product.leafKey && chart.coversLeaves.includes(product.leafKey) ? 1 : 0,
    };
    const better =
      best === null ||
      candidate.full > best.full ||
      (candidate.full === best.full &&
        (candidate.covers > best.covers ||
          (candidate.covers === best.covers && rowBySize.size > best.assignment.rowBySize.size)));
    if (better) best = candidate;
  }
  return best?.assignment ?? null;
}

export interface AssignedProduct {
  product: FitSearchProductDto;
  assignment: ChartAssignment | null;
}

/** The chart rows this product has in stock within tolerance (its `fitSizes`, located in the chart). */
export function fittingRowIndexes(item: AssignedProduct): Set<number> {
  const indexes = new Set<number>();
  if (!item.assignment) return indexes;
  for (const size of item.product.fitSizes) {
    const index = item.assignment.rowBySize.get(size);
    if (index !== undefined) indexes.add(index);
  }
  return indexes;
}

export interface SearchSummary {
  /** Per chart row: how many of the chart's products ACS returned have that size in stock and within tolerance. */
  counts: number[];
  /** The best row among those ACS produced products for, or -1. */
  bestIndex: number;
}

function rowJson(row: MultiSystemRow, group: SizingGroup, audience: Audience): string {
  const payload: Record<string, unknown> = { s: row.sizeLabel };
  for (const measurement of measurementsFor(group, audience)) {
    if (!isBodyMeasurement(measurement)) continue;
    const bounds = rowBounds(row, measurement);
    if (bounds) payload[measurement] = bounds;
  }
  return JSON.stringify(payload);
}

/** Inside the range wins over merely within tolerance, then the closest range middle, then the bigger size. */
function nearestRow(
  rows: readonly MultiSystemRow[],
  group: SizingGroup,
  audience: Audience,
  body: Partial<Record<Measurement, number>>,
  counts: readonly number[],
): number {
  const [measurement] = requiredMeasurementsFor(group, audience);
  const target = measurement === undefined ? undefined : body[measurement];
  if (measurement === undefined || target === undefined) return -1;
  let bestIndex = -1;
  let best: { outside: number; middle: number; centre: number } | null = null;
  rows.forEach((row, index) => {
    if (counts[index] === 0) return;
    const bounds = rowBounds(row, measurement);
    if (!bounds) return;
    const [min, max] = bounds;
    const outside = min !== null && target < min ? min - target : max !== null && target > max ? target - max : 0;
    const centre = min !== null && max !== null ? (min + max) / 2 : (min ?? max)!;
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
  return bestIndex;
}

/**
 * Reads ACS's answer against one chart. ACS decides which products come back; each product's
 * indexed rows say which of its sizes sit within tolerance. The best row is chosen only among rows
 * ACS actually produced products for, ranked by `fitRowSizes` on the chart's own rows (the same
 * ranking each product's `fitSizes` is ordered by).
 */
export function summarizeChart(
  rows: readonly MultiSystemRow[],
  group: SizingGroup,
  audience: Audience,
  body: Partial<Record<Measurement, number>>,
  products: readonly AssignedProduct[],
): SearchSummary {
  const counts = rows.map(() => 0);
  for (const item of products) for (const index of fittingRowIndexes(item)) counts[index] += 1;

  const ranked = fitRowSizes(rows.map((row) => rowJson(row, group, audience)), group, body, isChildAudience(audience));
  for (const label of ranked) {
    const index = rows.findIndex((row) => row.sizeLabel === label);
    if (index >= 0 && counts[index] > 0) return { counts, bestIndex: index };
  }
  return { counts, bestIndex: nearestRow(rows, group, audience, body, counts) };
}

export interface SubcategoryGroup {
  /** `null` gathers products whose Persona leaf could not be read. */
  leafKey: string | null;
  label: string;
  products: FitSearchProductDto[];
}

/** The Persona subcategories among ACS's answer, biggest first. */
export function groupBySubcategory(products: readonly FitSearchProductDto[]): SubcategoryGroup[] {
  const groups = new Map<string | null, FitSearchProductDto[]>();
  for (const product of products) {
    const list = groups.get(product.leafKey) ?? [];
    list.push(product);
    groups.set(product.leafKey, list);
  }
  const departments = new Set([...groups.keys()].flatMap((key) => (key ? [key.split(":")[0]] : [])));
  return [...groups]
    .map(([leafKey, list]) => {
      if (!leafKey) return { leafKey, label: "Other", products: list };
      const [department, , sub] = leafKey.split(":");
      const name = formatLeafLabel(sub ?? leafKey);
      const departmentName = PERSONA_DEPARTMENTS.find((item) => item.id === department)?.name ?? department;
      return { leafKey, label: departments.size > 1 ? `${name} · ${departmentName}` : name, products: list };
    })
    .sort((left, right) => right.products.length - left.products.length || left.label.localeCompare(right.label));
}
