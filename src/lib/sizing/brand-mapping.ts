import { normalizeBrandKey, UNKNOWN_BRAND_KEY } from "./keys";

export const BRAND_MAPPING_VERSION = 1 as const;

export interface BrandAliasMapping {
  canonicalKey: string;
  canonicalName: string;
  labels: string[];
  skuCount: number;
  sizingCategories: string[];
}

export interface StoreBrandMapping {
  version: typeof BRAND_MAPPING_VERSION;
  confirmedAt: string | null;
  sourceFingerprint: string;
  observed: Record<string, string[]>;
  aliases: Record<string, BrandAliasMapping>;
}

export interface DiscoveredBrand {
  rawKey: string;
  labels: string[];
  skuCount: number;
  sizingCategories: string[];
}

export interface CanonicalBrandTarget {
  canonicalKey: string;
  canonicalName: string;
  shared: boolean;
}

export interface BrandMappingGroup {
  canonicalKey: string;
  canonicalName: string;
  rawKeys: string[];
  shared: boolean;
}

const EMPTY_MAPPING: StoreBrandMapping = {
  version: BRAND_MAPPING_VERSION,
  confirmedAt: null,
  sourceFingerprint: "",
  observed: {},
  aliases: {},
};

const QUALIFIER_TOKENS = new Set([
  "men",
  "mens",
  "man",
  "male",
  "women",
  "womens",
  "woman",
  "female",
  "kid",
  "kids",
  "boy",
  "boys",
  "girl",
  "girls",
]);

function cleanLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const label = item.trim().replace(/\s+/g, " ");
    if (!label) continue;
    const comparable = label.toLocaleLowerCase();
    if (!unique.has(comparable)) unique.set(comparable, label);
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b));
}

function cleanObserved(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const observed: Record<string, string[]> = {};
  for (const [key, labels] of Object.entries(value as Record<string, unknown>)) {
    const rawKey = normalizeBrandKey(key);
    if (!rawKey) continue;
    const cleaned = cleanLabels(labels);
    if (cleaned.length > 0) observed[rawKey] = cleaned;
  }
  return observed;
}

/** Defensive parser for the JSONB document. Invalid entries are omitted rather than trusted. */
export function parseStoreBrandMapping(value: unknown): StoreBrandMapping {
  if (!value || typeof value !== "object" || Array.isArray(value)) return structuredClone(EMPTY_MAPPING);
  const input = value as Record<string, unknown>;
  const observed = cleanObserved(input.observed);
  const aliases: Record<string, BrandAliasMapping> = {};

  if (input.aliases && typeof input.aliases === "object" && !Array.isArray(input.aliases)) {
    for (const [key, rawAlias] of Object.entries(input.aliases as Record<string, unknown>)) {
      if (!rawAlias || typeof rawAlias !== "object" || Array.isArray(rawAlias)) continue;
      const rawKey = normalizeBrandKey(key);
      const alias = rawAlias as Record<string, unknown>;
      const canonicalKey = normalizeBrandKey(
        typeof alias.canonicalKey === "string" ? alias.canonicalKey : "",
      );
      const canonicalName =
        typeof alias.canonicalName === "string" ? alias.canonicalName.trim().replace(/\s+/g, " ") : "";
      if (!rawKey || !canonicalKey || !canonicalName) continue;
      const labels = cleanLabels(alias.labels);
      aliases[rawKey] = {
        canonicalKey,
        canonicalName,
        labels: labels.length > 0 ? labels : observed[rawKey] ?? [key],
        skuCount: typeof alias.skuCount === "number" && alias.skuCount >= 0 ? alias.skuCount : 0,
        sizingCategories: cleanLabels(alias.sizingCategories),
      };
    }
  }

  return {
    version: BRAND_MAPPING_VERSION,
    confirmedAt: typeof input.confirmedAt === "string" && input.confirmedAt ? input.confirmedAt : null,
    sourceFingerprint: typeof input.sourceFingerprint === "string" ? input.sourceFingerprint : "",
    observed,
    aliases,
  };
}

/** Adds spellings seen during a scan without changing or silently confirming merchant decisions. */
export function mergeObservedBrandLabels(
  mapping: StoreBrandMapping,
  labels: readonly (string | null | undefined)[],
): StoreBrandMapping {
  const observed = { ...mapping.observed };
  for (const raw of labels) {
    const label = raw?.trim().replace(/\s+/g, " ");
    const rawKey = normalizeBrandKey(label);
    if (!label || rawKey === UNKNOWN_BRAND_KEY) continue;
    observed[rawKey] = cleanLabels([...(observed[rawKey] ?? []), label]);
  }
  return { ...mapping, observed };
}

/** Resolves one store label before any coverage/path/product key is written. */
export function resolveMappedBrand(
  rawBrand: string | null | undefined,
  mapping: StoreBrandMapping,
): { brandKey: string; brandName: string | null } {
  const rawKey = normalizeBrandKey(rawBrand);
  if (rawKey === UNKNOWN_BRAND_KEY) return { brandKey: UNKNOWN_BRAND_KEY, brandName: null };
  const alias = mapping.aliases[rawKey];
  return alias
    ? { brandKey: alias.canonicalKey, brandName: alias.canonicalName }
    : { brandKey: rawKey, brandName: rawBrand?.trim() || rawKey };
}

function compact(value: string): string {
  return normalizeBrandKey(value).replace(/_/g, "");
}

function withoutAudienceQualifier(value: string): string | null {
  const parts = normalizeBrandKey(value).split("_").filter(Boolean);
  if (parts.length < 2 || !QUALIFIER_TOKENS.has(parts.at(-1)!)) return null;
  return parts.slice(0, -1).join("_") || null;
}

export function brandDisplayNameFromKey(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function preferredName(brand: DiscoveredBrand, strippedKey: string | null): string {
  if (strippedKey) {
    for (const label of brand.labels) {
      const words = label.trim().split(/\s+/);
      const last = normalizeBrandKey(words.at(-1));
      if (last && QUALIFIER_TOKENS.has(last)) return words.slice(0, -1).join(" ");
    }
  }
  return brand.labels.find((label) => /[A-Z]/.test(label)) ?? brand.labels[0] ?? brandDisplayNameFromKey(brand.rawKey);
}

/**
 * Conservative, deterministic suggestions. Audience words are removed only when the resulting base
 * is independently evidenced by another discovered label or an existing shared chart key.
 */
export function suggestBrandMappingGroups(
  brands: readonly DiscoveredBrand[],
  targets: readonly CanonicalBrandTarget[],
): BrandMappingGroup[] {
  const targetByCompact = new Map<string, CanonicalBrandTarget>();
  for (const target of targets) targetByCompact.set(compact(target.canonicalKey), target);

  const brandByCompact = new Map<string, DiscoveredBrand>();
  for (const brand of brands) {
    const key = compact(brand.rawKey);
    const existing = brandByCompact.get(key);
    if (!existing || brand.rawKey.length < existing.rawKey.length) brandByCompact.set(key, brand);
  }

  const grouped = new Map<string, BrandMappingGroup>();
  for (const brand of [...brands].sort((a, b) => a.rawKey.localeCompare(b.rawKey))) {
    const exactTarget = targetByCompact.get(compact(brand.rawKey));
    const strippedKey = withoutAudienceQualifier(brand.rawKey);
    const strippedCompact = strippedKey ? compact(strippedKey) : null;
    const baseTarget = strippedCompact ? targetByCompact.get(strippedCompact) : undefined;
    const baseBrand = strippedCompact ? brandByCompact.get(strippedCompact) : undefined;

    const canonicalKey = baseTarget?.canonicalKey ?? baseBrand?.rawKey ?? exactTarget?.canonicalKey ?? brand.rawKey;
    const canonicalName =
      baseTarget?.canonicalName ??
      (baseBrand
        ? preferredName(baseBrand, withoutAudienceQualifier(baseBrand.rawKey))
        : exactTarget?.canonicalName ?? preferredName(brand, strippedKey));
    const shared = baseTarget?.shared ?? (baseBrand ? false : exactTarget?.shared ?? false);
    const existing = grouped.get(canonicalKey);
    if (existing) {
      existing.rawKeys.push(brand.rawKey);
    } else {
      grouped.set(canonicalKey, { canonicalKey, canonicalName, rawKeys: [brand.rawKey], shared });
    }
  }

  return [...grouped.values()].sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
}

/** Small stable hash used only to detect whether the reviewed raw-brand set changed. */
export function brandSourceFingerprint(rawKeys: readonly string[]): string {
  const source = [...new Set(rawKeys.map(normalizeBrandKey).filter(Boolean))].sort().join("\n");
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function mappingFromGroups(
  current: StoreBrandMapping,
  brands: readonly DiscoveredBrand[],
  groups: readonly BrandMappingGroup[],
  confirmedAt: string,
): StoreBrandMapping {
  const expected = new Set(brands.map((brand) => brand.rawKey));
  const assigned = new Set<string>();
  const aliases: Record<string, BrandAliasMapping> = {};

  for (const group of groups) {
    const canonicalKey = normalizeBrandKey(group.canonicalKey);
    const canonicalName = group.canonicalName.trim().replace(/\s+/g, " ");
    if (!canonicalKey || !canonicalName) throw new Error("Every canonical brand needs a name.");
    for (const key of group.rawKeys) {
      const rawKey = normalizeBrandKey(key);
      if (!expected.has(rawKey)) throw new Error(`Unknown store brand: ${key}`);
      if (assigned.has(rawKey)) throw new Error(`Store brand ${key} is assigned more than once.`);
      assigned.add(rawKey);
      aliases[rawKey] = {
        canonicalKey,
        canonicalName,
        labels: current.observed[rawKey] ?? brands.find((brand) => brand.rawKey === rawKey)?.labels ?? [rawKey],
        skuCount: brands.find((brand) => brand.rawKey === rawKey)?.skuCount ?? 0,
        sizingCategories: brands.find((brand) => brand.rawKey === rawKey)?.sizingCategories ?? [],
      };
    }
  }

  if (assigned.size !== expected.size) {
    throw new Error("Every global store brand must belong to exactly one canonical brand.");
  }

  return {
    ...current,
    confirmedAt,
    sourceFingerprint: brandSourceFingerprint([...expected]),
    aliases,
  };
}
