/**
 * The merchant path config: one store's in-stock catalog summarised per Persona path.
 *
 * Paths are written without the `persona >` root ("women > bottom > trouser") because that is the
 * shape the agents read and emit. Code adds the root back when it builds an ACS filter.
 */

export const PATH_CONFIG_VERSION = 1;

export type PathConfigNodeLevel = "department" | "category" | "leaf";

export interface PathConfigBrand {
  name: string;
  count: number;
}

export interface PathConfigTier {
  label: "A" | "B" | "C";
  min: number;
  max: number;
  count: number;
}

export interface PathConfigAttribute {
  /** What the agent writes in `attributes` — the shopper-facing label of the field. */
  key: string;
  /** Exact ACS filter field: a native field (`colors`, `materials`, `patterns`) or
   *  `attributes.<custom key>`. */
  field: string;
  source: "native" | "custom";
  kind: "text" | "number";
  /** Every in-stock value on this path, for text attributes. */
  values?: string[];
  /** Observed bounds, for numeric attributes. */
  range?: { min: number; max: number };
}

export interface PathConfigNode {
  path: string;
  level: PathConfigNodeLevel;
  department: string;
  category: string | null;
  leaf: string | null;
  inStock: number;
  priceRange: { min: number; max: number } | null;
  tiers: PathConfigTier[];
  brands: PathConfigBrand[];
  attributes: PathConfigAttribute[];
  /** Every size label listed on this path, exact spellings. Kept for validation only and never
   *  rendered: a size filter is added only when the shopper names one. */
  sizes: string[];
}

export interface PersonaPathConfig {
  version: number;
  currency: string | null;
  inStock: number;
  /** Departments, categories and leaves, sorted by path. */
  nodes: PathConfigNode[];
}

export interface StoredPathConfig {
  connectionId: string;
  config: PersonaPathConfig;
  renderedText: string;
  fingerprint: string;
  taxonomyVersion: number;
  builtAt: string;
  staleAt: string | null;
  geminiCacheName: string | null;
  geminiCacheKey: string | null;
  geminiCacheExpiresAt: string | null;
}
