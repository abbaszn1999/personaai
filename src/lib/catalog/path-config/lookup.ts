import type { PathConfigAttribute, PathConfigBrand, PathConfigNode, PersonaPathConfig } from "./types";

const SEPARATOR = " > ";

/** Accepts what a model plausibly writes — `Women > Bottom > Trouser`, `persona > women > bottom`,
 *  `women/bottom/trouser` — and returns the config's own path shape. */
export function normalizePath(raw: string): string {
  const segments = raw
    .toLowerCase()
    .split(/\s*(?:>|\/|›)\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments[0] === "persona") segments.shift();
  return segments.join(SEPARATOR);
}

export function findNode(config: PersonaPathConfig, rawPath: string): PathConfigNode | null {
  const path = normalizePath(rawPath);
  return config.nodes.find((node) => node.path === path) ?? null;
}

/** The node itself plus every node below it. */
export function descendantLeaves(config: PersonaPathConfig, node: PathConfigNode): PathConfigNode[] {
  if (node.level === "leaf") return [node];
  return config.nodes.filter((candidate) => candidate.level === "leaf" && candidate.path.startsWith(`${node.path}${SEPARATOR}`));
}

/** Brands on a node — its own list, which for a category or department already covers every leaf
 *  below it because the builder counts each product at every level it belongs to. */
export function brandsOf(node: PathConfigNode): PathConfigBrand[] {
  return node.brands;
}

export function attributesOf(node: PathConfigNode): PathConfigAttribute[] {
  return node.attributes;
}

/** Gender-neutral counterpart that shoppers of the given department can also wear. */
export function unisexDepartmentFor(department: string): string | null {
  if (department === "women" || department === "men") return "unisex";
  if (department === "kids-boys" || department === "kids-girls") return "kids-unisex";
  return null;
}

/** The same path in the unisex counterpart department, when the store stocks it. */
export function unisexCounterpart(config: PersonaPathConfig, node: PathConfigNode): PathConfigNode | null {
  const counterpart = unisexDepartmentFor(node.department);
  if (!counterpart) return null;
  const rest = node.path.split(SEPARATOR).slice(1);
  return findNode(config, [counterpart, ...rest].join(SEPARATOR));
}

/** Lowest price at which this node has any in-stock product. */
export function floorPrice(node: PathConfigNode): number | null {
  return node.priceRange?.min ?? null;
}

/**
 * The comparison form of a catalog value: case, accents, spacing and punctuation never decide a
 * match, so "Off-White", "off white" and "OFFWHITE" are one colour and "Tommy-Hilfiger" is
 * "Tommy Hilfiger". A value made only of symbols keeps its plain lowercase form.
 */
export function comparableValue(value: string): string {
  const squashed = value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
  return squashed || value.trim().toLowerCase();
}

/** Shorthand merchants put in front of a colour: `L.GREY`, `LT GREY`, `D.BLUE`, `DK GREEN`, `N.BLUE`. */
const COLOUR_SHORTHAND: Array<[RegExp, string]> = [
  [/^(?:lt?\s*\.\s*|lt\s+)/i, "light "],
  [/^(?:dk?\s*\.\s*|dk\s+)/i, "dark "],
  [/^n\s*\.\s*blue\b/i, "navy"],
];

export function isColourAttribute(attribute: Pick<PathConfigAttribute, "key" | "field">): boolean {
  return attribute.field === "colors" || /colou?r/i.test(attribute.key);
}

/**
 * `comparableValue` for one attribute's values. Colours also read through merchant shorthand and
 * both spellings of grey, so "L.GREY", "Light Grey" and "light gray" are one colour.
 */
export function comparableAttributeValue(attribute: Pick<PathConfigAttribute, "key" | "field">, value: string): string {
  if (!isColourAttribute(attribute)) return comparableValue(value);
  return comparableValue(expandColourShorthand(value)).replace(/gray/g, "grey").replace(/^navyblue$/, "navy");
}

function expandColourShorthand(value: string): string {
  let expanded = value.trim();
  for (const [pattern, word] of COLOUR_SHORTHAND) expanded = expanded.replace(pattern, word);
  return expanded;
}

/** A colour value's words, read through the same shorthand: "L.GREY" is `["light", "grey"]`. */
export function colourWords(value: string): string[] {
  return expandColourShorthand(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) => (word === "gray" ? "grey" : word));
}

export function toAcsCategory(path: string): string {
  return `persona${SEPARATOR}${normalizePath(path)}`;
}
