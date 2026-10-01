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

export function toAcsCategory(path: string): string {
  return `persona${SEPARATOR}${normalizePath(path)}`;
}
