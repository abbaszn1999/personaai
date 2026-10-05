import type { SizeAliasKey } from "./chart-schema";
import { normalizeSizeLabel } from "./keys";

const ALPHA_FORMS: Record<string, string> = {
  "EXTRA SMALL": "XS",
  "X SMALL": "XS",
  XSMALL: "XS",
  XS: "XS",
  SMALL: "S",
  SM: "S",
  S: "S",
  MEDIUM: "M",
  MED: "M",
  MD: "M",
  M: "M",
  LARGE: "L",
  LG: "L",
  L: "L",
  "EXTRA LARGE": "XL",
  "X LARGE": "XL",
  XLARGE: "XL",
  XL: "XL",
};

const ONE_SIZE_FORMS = new Set(["ONE SIZE", "ONE SIZE FITS ALL", "OSFA", "FREE SIZE", "TU", "UNI"]);
const REGIONAL_PREFIX =
  /^(US|UK|EU|FR|IT|DE|ES|AU|JP|CN|KR|RU)(?:\s*[-:]\s*|\s+)(.+)$/;

function normalizeSurface(label: string): string {
  return normalizeSizeLabel(
    label
      .replace(/[½]/g, ".5")
      .replace(/[¼]/g, ".25")
      .replace(/[¾]/g, ".75")
      .replace(/(\d)\s+1\/2\b/g, "$1.5")
      .replace(/(\d)\s+1\/4\b/g, "$1.25")
      .replace(/(\d)\s+3\/4\b/g, "$1.75")
      // Merchants write paired sizes as `3\4` or `S\M` (sometimes with several backslashes).
      // A backslash is never part of a size, so it is the same pair separator as `/`.
      .replace(/\\+/g, "/")
      .replace(/_/g, " ")
      .replace(/(?<=[A-Za-z])-(?=[A-Za-z])/g, " ")
      .replace(/\s+/g, " "),
  );
}

function compactNumber(value: string): string | null {
  const decimal = value.replace(/^0+(?=\d)/, "").replace(/^(\d+),(\d+)$/, "$1.$2");
  return /^\d+(?:\.\d+)?$/.test(decimal) ? decimal : null;
}

function canonicalSimple(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (ONE_SIZE_FORMS.has(normalized)) return "ONE SIZE";
  if (ALPHA_FORMS[normalized]) return ALPHA_FORMS[normalized];

  const xLarge = normalized.match(/^([2-4])\s*XL$/);
  if (xLarge) return `${"X".repeat(Number(xLarge[1]))}L`;
  const wordsLarge = normalized.match(/^(XX|XXX|XXXX)\s*(?:-\s*)?LARGE$/);
  if (wordsLarge) return `${wordsLarge[1]}L`;
  const wordsSmall = normalized.match(/^(XX|XXX)\s*(?:-\s*)?SMALL$/);
  if (wordsSmall) return `${wordsSmall[1]}S`;

  const months = normalized.match(/^(\d+)[-\s]*(?:MOIS|MONTHS?|MTHS?)$/);
  if (months) return `${Number(months[1])}M`;
  const years = normalized.match(/^(\d+)[-\s]*(?:YEARS?|YRS?)$/);
  if (years) return `${Number(years[1])}Y`;
  if (normalized === "NEWBORN") return "NB";

  const ageRange = normalized.match(
    /^(\d+)\s*(?:-|\/|TO)\s*(\d+)\s*(M|MO|MOS|MONTH|MONTHS|Y|YR|YRS|YEAR|YEARS)$/,
  );
  if (ageRange) {
    const unit = ageRange[3].startsWith("M") ? "M" : "Y";
    return `${Number(ageRange[1])}-${Number(ageRange[2])}${unit}`;
  }

  const waistInseam = normalized.match(/^W?(\d{2})\s*[X/]\s*L?(\d{2})$/);
  // 11/12 is a pair of ages, not a waist and a leg; no waist is below 20.
  if (waistInseam && Number(waistInseam[1]) >= 20) return `${waistInseam[1]}${waistInseam[2]}`;

  // Paired kid/age sizes (`3/4`, `3-4`) are one range regardless of the separator the store used.
  const pair = normalized.match(/^(\d{1,2})\s*[-/]\s*(\d{1,2})$/);
  if (pair && Number(pair[2]) > Number(pair[1])) return `${Number(pair[1])}-${Number(pair[2])}`;

  return compactNumber(normalized) ?? normalized;
}

/** Keys whose labels are ages: `3-4` is a range of years there, never a pair of sizes. */
const NO_RANGE_EXPANSION_KEYS = new Set<string>(["age"]);

/**
 * `31-32`, `6-8`: the source prints one cell for two adjacent sizes. Expanding lets a store label
 * `32` match the row. Only done for chart labels (see `labelsOverlap`), never for stock labels, and
 * only for the scales where such a cell means "these sizes": adult numerics (>= 20) and US/UK.
 */
export function expandedRangeLabels(label: string, key?: SizeAliasKey): string[] {
  if (key && NO_RANGE_EXPANSION_KEYS.has(key)) return [];
  const match = normalizeSurface(label).match(/^(\d{1,2}(?:\.\d)?)\s*-\s*(\d{1,2}(?:\.\d)?)$/);
  if (!match) return [];
  const low = Number(match[1]);
  const high = Number(match[2]);
  const adultScale = low >= 20 && high <= 60;
  const regionalScale = key === "us" || key === "uk";
  if (!(adultScale || regionalScale) || high <= low || high - low > 4) return [];
  const values: string[] = [];
  for (let value = low; value <= high + 1e-9; value += 1) values.push(String(Math.round(value * 100) / 100));
  return values;
}

/**
 * Equivalent comparison forms for a merchant or chart size label.
 *
 * `declaredKey` controls regional prefix stripping. A US store may strip `US 8`, but `EU 38`
 * deliberately remains prefixed and therefore cannot accidentally match the US column.
 */
export function sizeLabelCandidates(label: string, declaredKey?: SizeAliasKey): string[] {
  let surface = normalizeSurface(label);
  if (!surface) return [];

  surface = surface.replace(/^(?:SIZE|TALLA|TAILLE)\s*[-:]?\s+/, "");

  const regional = surface.match(REGIONAL_PREFIX);
  if (regional) {
    const prefix = regional[1].toLowerCase();
    if (declaredKey !== prefix) return [surface];
    surface = regional[2];
  }

  const candidates: string[] = [];
  const add = (value: string) => {
    const canonical = canonicalSimple(value);
    if (canonical && !candidates.includes(canonical)) candidates.push(canonical);
  };

  add(surface);

  // Compound labels publish two valid systems in one token: `M (38)` or `38 / M`.
  const parenthesized = surface.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (parenthesized) {
    add(parenthesized[1]);
    add(parenthesized[2]);
  } else {
    const slashParts = surface.split(/\s*\/\s*/);
    const mixedSystems =
      slashParts.length === 2 &&
      slashParts.some((part) => /^\d+(?:\.\d+)?$/.test(part)) &&
      slashParts.some((part) => /[A-Z]/.test(part));
    if (mixedSystems && !/^W?\d{2}\s*\/\s*L?\d{2}$/.test(surface)) {
      for (const part of slashParts) add(part);
    }
  }

  return candidates;
}

