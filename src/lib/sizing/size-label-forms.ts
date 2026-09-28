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
const REGIONAL_PREFIX = /^(US|UK|EU)\s*[-:]?\s*(.+)$/;

function normalizeSurface(label: string): string {
  return normalizeSizeLabel(
    label
      .replace(/[½]/g, ".5")
      .replace(/[¼]/g, ".25")
      .replace(/[¾]/g, ".75")
      .replace(/(\d)\s+1\/2\b/g, "$1.5")
      .replace(/(\d)\s+1\/4\b/g, "$1.25")
      .replace(/(\d)\s+3\/4\b/g, "$1.75")
      .replace(/[_-]+/g, " ")
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
  const wordsLarge = normalized.match(/^(XX|XXX|XXXX)\s+LARGE$/);
  if (wordsLarge) return `${wordsLarge[1]}L`;

  const months = normalized.match(/^(\d+)\s*(?:MOIS|MONTHS?|MTHS?)$/);
  if (months) return `${Number(months[1])}M`;
  const years = normalized.match(/^(\d+)\s*(?:YEARS?|YRS?)$/);
  if (years) return `${Number(years[1])}Y`;
  if (normalized === "NEWBORN") return "NB";

  const waistInseam = normalized.match(/^(\d{2})\s*[X/]\s*(\d{2})$/);
  if (waistInseam) return `${waistInseam[1]}${waistInseam[2]}`;

  return compactNumber(normalized) ?? normalized;
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
  } else if (!/^\d{2}\s*\/\s*\d{2}$/.test(surface)) {
    for (const part of surface.split(/\s*\/\s*/)) if (part !== surface) add(part);
  }

  return candidates;
}

