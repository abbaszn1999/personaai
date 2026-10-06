import type { SizingChartRow } from "@/lib/db/sizing-charts";
import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";
import {
  preferredAliasLabel,
  type SizeAliases,
  type SizeChartRow,
} from "@/lib/sizing/chart-schema";
import type { CanonicalBrandMember } from "@/lib/sizing/brand-mapping-view";
import {
  isSizingGroup,
  SIZING_GROUP_KEYS,
  SIZING_GROUP_LABELS,
  type SizingGroup,
} from "@/lib/sizing/measurements";
import type { SizingTarget } from "@/lib/sizing/sizing-target";

export type TesterPersona = SizingTarget;
export type TesterBrandType = "global" | "private";
export type TesterFitType =
  | "True to Size"
  | "Athletic / Slim"
  | "Relaxed / Oversized"
  | "Standard Denim"
  | "Snug Fit";

/**
 * The Sizing Tester wire types intentionally mirror the existing demo component's shapes.
 * Extra provenance fields retain the real stored chart behind each display-compatible option.
 */
export interface MultiSystemRow {
  sizeLabel: string;
  usSize: string;
  euSize: string;
  ukSize: string;
  chestMin?: number;
  chestMax?: number;
  waistMin?: number;
  waistMax?: number;
  hipsMin?: number;
  hipsMax?: number;
  heightMin?: number;
  heightMax?: number;
  footLengthMin?: number;
  footLengthMax?: number;
  ageLabel?: string;
  ageMin?: number;
  ageMax?: number;
  chestCm?: string;
  chestIn?: string;
  waistCm?: string;
  waistIn?: string;
  hipsCm?: string;
  hipsIn?: string;
  lengthCm?: string;
  lengthIn?: string;
  footLengthCm?: string;
  footLengthIn?: string;
  sleeveCm?: string;
  sleeveIn?: string;
  inseamCm?: string;
  inseamIn?: string;
  fitNote?: string;
  /** Verbatim aliases and row make the adapter lossless for future tester controls. */
  aliases?: SizeAliases;
  chartRow: SizeChartRow;
}

export interface BrandSubCategory {
  id: string;
  name: string;
  fitType: TesterFitType;
  fitDescription: string;
  rowsByPersona: Partial<Record<TesterPersona, MultiSystemRow[]>>;
  chartId: string;
  audience: SizingChartRow["audience"];
  confidence: number;
  sourceTitle: string;
  sourceUrl: string | null;
  coversLeaves: string[];
  chartRows: SizeChartRow[];
}

export interface BrandCategory {
  key: SizingGroup;
  label: string;
  subcategories: BrandSubCategory[];
  skuCount: number;
}

export interface TesterBrand {
  id: string;
  name: string;
  /** Raw catalog brand names routed to this canonical chart brand. */
  sourceBrandNames: string[];
  type: TesterBrandType;
  /** Retains the distinction hidden by the demo's two-value `type` field. */
  coverageType: "global" | "private" | "none";
  logoInitials: string;
  accentColor: string;
  confidence: number;
  skuCount: number;
  sourceNote: string;
  fitPhilosophy: string;
  categories: BrandCategory[];
}

export interface SizingTesterOptionsResponse {
  brands: TesterBrand[];
}

const ACCENTS = [
  "from-violet-600 to-indigo-700",
  "from-blue-600 to-cyan-700",
  "from-emerald-600 to-teal-700",
  "from-amber-600 to-orange-700",
  "from-rose-600 to-pink-700",
] as const;

function displayRange(min: number | undefined, max: number | undefined): string | undefined {
  if (min === undefined && max === undefined) return undefined;
  if (min === undefined) return `≤ ${max}`;
  if (max === undefined) return `${min}+`;
  return min === max ? String(min) : `${min}–${max}`;
}

function inchesRange(min: number | undefined, max: number | undefined): string | undefined {
  const inches = (value: number | undefined) =>
    value === undefined ? undefined : Math.round((value / 2.54) * 10) / 10;
  return displayRange(inches(min), inches(max));
}

function ageRange(ageLabel: string | undefined): { ageMin?: number; ageMax?: number } {
  if (!ageLabel || /\d\s*(?:m|mo|month)s?\b/i.test(ageLabel)) return {};
  const values = ageLabel.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) return {};
  if (values.length === 1) return { ageMin: values[0], ageMax: values[0] };
  return { ageMin: Math.min(values[0]!, values[1]!), ageMax: Math.max(values[0]!, values[1]!) };
}

/** Converts one stored row without changing, sorting, or coalescing its labels. */
export function chartRowToMultiSystemRow(
  row: SizeChartRow,
  sourceTitle = "",
): MultiSystemRow {
  const aliases = row.aliases ? { ...row.aliases } : undefined;
  const lengthMin = row.body_length_min ?? row.dress_length_min;
  const lengthMax = row.body_length_max ?? row.dress_length_max;
  const ageLabel = preferredAliasLabel(row.aliases?.age);
  const ages = ageRange(ageLabel);

  return {
    sizeLabel: row.size,
    usSize: preferredAliasLabel(row.aliases?.us) ?? row.size,
    euSize: preferredAliasLabel(row.aliases?.eu) ?? row.size,
    ukSize: preferredAliasLabel(row.aliases?.uk) ?? row.size,
    chestMin: row.chest_min,
    chestMax: row.chest_max,
    waistMin: row.waist_min,
    waistMax: row.waist_max,
    hipsMin: row.hip_min,
    hipsMax: row.hip_max,
    heightMin: row.height_min,
    heightMax: row.height_max,
    footLengthMin: row.foot_length_min,
    footLengthMax: row.foot_length_max,
    ageLabel,
    ...ages,
    chestCm: displayRange(row.chest_min, row.chest_max),
    chestIn: inchesRange(row.chest_min, row.chest_max),
    waistCm: displayRange(row.waist_min, row.waist_max),
    waistIn: inchesRange(row.waist_min, row.waist_max),
    hipsCm: displayRange(row.hip_min, row.hip_max),
    hipsIn: inchesRange(row.hip_min, row.hip_max),
    lengthCm: displayRange(lengthMin, lengthMax),
    lengthIn: inchesRange(lengthMin, lengthMax),
    footLengthCm: displayRange(row.foot_length_min, row.foot_length_max),
    footLengthIn: inchesRange(row.foot_length_min, row.foot_length_max),
    sleeveCm: displayRange(row.sleeve_min, row.sleeve_max),
    sleeveIn: inchesRange(row.sleeve_min, row.sleeve_max),
    inseamCm: displayRange(row.inseam_min, row.inseam_max),
    inseamIn: inchesRange(row.inseam_min, row.inseam_max),
    fitNote: sourceTitle || undefined,
    aliases,
    chartRow: structuredClone(row),
  };
}

export function testerPersonasForAudience(
  audience: SizingChartRow["audience"],
): TesterPersona[] {
  if (audience === "mens") return ["men"];
  if (audience === "womens") return ["women"];
  if (audience === "unisex") return ["men", "women"];
  return ["kid"];
}

function initials(name: string): string {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  if (words.length === 0) return "NB";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0]!.charAt(0)}${words[1]!.charAt(0)}`.toUpperCase();
}

function accentFor(key: string): string {
  let hash = 0;
  for (const character of key) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
  return ACCENTS[Math.abs(hash) % ACCENTS.length];
}

function fitTypeFor(name: string): TesterFitType {
  if (/\b(?:denim|jeans?)\b/i.test(name)) return "Standard Denim";
  if (/\b(?:slim|tailored|athletic|compression)\b/i.test(name)) return "Athletic / Slim";
  if (/\b(?:relaxed|oversized|loose|boxy)\b/i.test(name)) return "Relaxed / Oversized";
  if (/\b(?:snug|narrow)\b/i.test(name)) return "Snug Fit";
  return "True to Size";
}

function confidencePercent(charts: readonly SizingChartRow[]): number {
  const values = charts
    .map((chart) => chart.confidence)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 1000) / 10;
}

function rowsByPersona(chart: SizingChartRow): BrandSubCategory["rowsByPersona"] {
  const rows = chart.chartRows.map((row) => chartRowToMultiSystemRow(row, chart.sourceTitle));
  return Object.fromEntries(
    testerPersonasForAudience(chart.audience).map((persona) => [persona, rows]),
  ) as BrandSubCategory["rowsByPersona"];
}

/**
 * Joins charts to the connection's canonical coverage. Charts outside this store's covered
 * brand/category pairs are deliberately omitted; rows inside a chart remain byte-for-byte present
 * in `chartRows` and in their original order.
 */
export function buildSizingTesterOptions(
  coverage: readonly SizingCoverageRow[],
  charts: readonly SizingChartRow[],
  membersByCanonicalKey: ReadonlyMap<string, readonly CanonicalBrandMember[]> = new Map(),
): SizingTesterOptionsResponse {
  const coveredPairs = new Map<string, SizingCoverageRow>();
  for (const row of coverage) {
    if (!isSizingGroup(row.sizingCategory) || row.brandType === "unclassified") continue;
    const key = `${row.brandKey}\u0000${row.sizingCategory}`;
    const current = coveredPairs.get(key);
    if (current) current.skuCount += row.skuCount;
    else coveredPairs.set(key, { ...row });
  }

  const chartsByBrand = new Map<string, SizingChartRow[]>();
  for (const chart of charts) {
    if (!isSizingGroup(chart.sizingCategory)) continue;
    if (!coveredPairs.has(`${chart.brandKey}\u0000${chart.sizingCategory}`)) continue;
    const brandCharts = chartsByBrand.get(chart.brandKey) ?? [];
    brandCharts.push(chart);
    chartsByBrand.set(chart.brandKey, brandCharts);
  }

  const brands: TesterBrand[] = [];
  for (const [brandKey, brandCharts] of chartsByBrand) {
    const brandCoverage = [...coveredPairs.values()].filter((row) => row.brandKey === brandKey);
    const coverageType = brandCoverage.some((row) => row.brandType === "global")
      ? "global"
      : brandCoverage.some((row) => row.brandType === "private")
        ? "private"
        : "none";
    const name =
      coverageType === "none"
        ? "No brand"
        : brandCoverage.find((row) => row.brandName)?.brandName ?? brandKey;
    const categories = SIZING_GROUP_KEYS.flatMap((group): BrandCategory[] => {
      const categoryCharts = brandCharts.filter((chart) => chart.sizingCategory === group);
      if (categoryCharts.length === 0) return [];
      const covered = coveredPairs.get(`${brandKey}\u0000${group}`);
      return [{
        key: group,
        label: SIZING_GROUP_LABELS[group],
        skuCount: covered?.skuCount ?? 0,
        subcategories: categoryCharts.map((chart) => ({
          id: chart.id,
          name: chart.variantName || SIZING_GROUP_LABELS[group],
          fitType: fitTypeFor(chart.variantName),
          fitDescription: chart.sourceTitle || `Published ${SIZING_GROUP_LABELS[group]} size chart`,
          rowsByPersona: rowsByPersona(chart),
          chartId: chart.id,
          audience: chart.audience,
          confidence: confidencePercent([chart]),
          sourceTitle: chart.sourceTitle,
          sourceUrl: chart.sourceUrl,
          coversLeaves: [...chart.coversLeaves],
          chartRows: structuredClone(chart.chartRows),
        })),
      }];
    });
    const sourceNotes = [...new Set(
      brandCharts.map((chart) => chart.sourceTitle || chart.sourceUrl).filter(Boolean),
    )];

    brands.push({
      id: brandKey || "no-brand",
      name,
      sourceBrandNames: coverageType === "none"
        ? []
        : membersByCanonicalKey.get(brandKey)?.map((member) => member.brandName) ?? [name],
      type: coverageType === "global" ? "global" : "private",
      coverageType,
      logoInitials: initials(name),
      accentColor: accentFor(brandKey || "no-brand"),
      confidence: confidencePercent(brandCharts),
      skuCount: brandCoverage.reduce((sum, row) => sum + row.skuCount, 0),
      sourceNote: sourceNotes.join(" · ") || "Connection chart",
      fitPhilosophy: `${brandCharts.length} available size ${brandCharts.length === 1 ? "chart" : "charts"} for this store's covered catalog.`,
      categories,
    });
  }

  brands.sort((left, right) => {
    if (left.coverageType === "none") return 1;
    if (right.coverageType === "none") return -1;
    return left.name.localeCompare(right.name);
  });
  return { brands };
}
