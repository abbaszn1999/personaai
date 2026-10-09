import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";
import {
  brandDisplayNameFromKey,
  brandSourceFingerprint,
  parseStoreBrandMapping,
  suggestBrandMappingGroups,
  type BrandMappingGroup,
  type CanonicalBrandTarget,
  type DiscoveredBrand,
  type StoreBrandMapping,
} from "./brand-mapping";

export type BrandMappingStatus = "needs_mapping" | "ready";

export interface BrandMappingState {
  ready: boolean;
  status: BrandMappingStatus;
  confirmedAt: string | null;
  sourceFingerprint: string;
  brands: DiscoveredBrand[];
  groups: BrandMappingGroup[];
  targets: CanonicalBrandTarget[];
  /** The store's own labels. Grouping them is optional and never blocks `ready`. */
  privateBrands: DiscoveredBrand[];
  privateGroups: BrandMappingGroup[];
}

function discoveredBrands(
  coverage: readonly SizingCoverageRow[],
  mapping: StoreBrandMapping,
  brandType: "global" | "private",
): DiscoveredBrand[] {
  const aggregate = new Map<string, DiscoveredBrand>();
  const aliases = brandType === "global" ? mapping.aliases : mapping.privateAliases;

  for (const row of coverage) {
    if (row.brandType !== brandType || !row.brandKey) continue;

    const current = aggregate.get(row.brandKey) ?? {
      rawKey: row.brandKey,
      labels: mapping.observed[row.brandKey] ?? aliases[row.brandKey]?.labels ?? [],
      skuCount: 0,
      sizingCategories: [],
    };
    const labels = [...current.labels];
    if (row.brandName && !labels.some((label) => label.toLocaleLowerCase() === row.brandName!.toLocaleLowerCase())) {
      labels.push(row.brandName);
    }
    current.labels = labels.length > 0 ? labels : [brandDisplayNameFromKey(row.brandKey)];
    current.skuCount += row.skuCount;
    if (!current.sizingCategories.includes(row.sizingCategory)) {
      current.sizingCategories.push(row.sizingCategory);
    }
    aggregate.set(row.brandKey, current);
  }

  return [...aggregate.values()]
    .map((brand) => ({
      ...brand,
      labels: [...brand.labels].sort((a, b) => a.localeCompare(b)),
      sizingCategories: [...brand.sizingCategories].sort(),
    }))
    .sort((a, b) => (a.labels[0] ?? a.rawKey).localeCompare(b.labels[0] ?? b.rawKey));
}

function groupsFromConfirmed(
  aliases: StoreBrandMapping["aliases"],
  brands: readonly DiscoveredBrand[],
  targets: readonly CanonicalBrandTarget[],
): BrandMappingGroup[] {
  const expected = new Set(brands.map((brand) => brand.rawKey));
  const shared = new Set(targets.filter((target) => target.shared).map((target) => target.canonicalKey));
  const grouped = new Map<string, BrandMappingGroup>();
  const assigned = new Set<string>();

  for (const [rawKey, alias] of Object.entries(aliases)) {
    if (!expected.has(rawKey)) continue;
    assigned.add(rawKey);
    const group = grouped.get(alias.canonicalKey);
    if (group) group.rawKeys.push(rawKey);
    else {
      grouped.set(alias.canonicalKey, {
        canonicalKey: alias.canonicalKey,
        canonicalName: alias.canonicalName,
        rawKeys: [rawKey],
        shared: shared.has(alias.canonicalKey),
      });
    }
  }

  const suggestions = suggestBrandMappingGroups(
    brands.filter((brand) => !assigned.has(brand.rawKey)),
    targets,
  );
  for (const suggestion of suggestions) {
    const group = grouped.get(suggestion.canonicalKey);
    if (group) group.rawKeys.push(...suggestion.rawKeys);
    else grouped.set(suggestion.canonicalKey, suggestion);
  }

  return [...grouped.values()].sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
}

export function buildBrandMappingState(input: {
  coverage: readonly SizingCoverageRow[];
  mapping: StoreBrandMapping;
  sharedBrandKeys: readonly string[];
}): BrandMappingState {
  const { coverage } = input;
  const mapping = parseStoreBrandMapping(input.mapping);
  const brands = discoveredBrands(coverage, mapping, "global");
  const privateBrands = discoveredBrands(coverage, mapping, "private");
  const knownNames = new Map<string, string>();
  for (const alias of Object.values(mapping.aliases)) knownNames.set(alias.canonicalKey, alias.canonicalName);
  for (const row of coverage) {
    if (row.brandCanonicalName) knownNames.set(row.brandKey, row.brandCanonicalName);
    else if (row.brandName && !knownNames.has(row.brandKey)) knownNames.set(row.brandKey, row.brandName);
  }

  const targetKeys = new Set([...input.sharedBrandKeys, ...knownNames.keys()]);
  const targets = [...targetKeys]
    .filter(Boolean)
    .map((canonicalKey) => ({
      canonicalKey,
      canonicalName: knownNames.get(canonicalKey) ?? brandDisplayNameFromKey(canonicalKey),
      shared: input.sharedBrandKeys.includes(canonicalKey),
    }))
    .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));

  const groups = mapping.confirmedAt
    ? groupsFromConfirmed(mapping.aliases, brands, targets)
    : suggestBrandMappingGroups(brands, targets);
  // Private labels suggest only among themselves: a store's own label is never a registry brand,
  // so "Moustache Men" folds into "Moustache" when the store also files plain "Moustache".
  const privateTargets = privateBrands.map((brand) => ({
    canonicalKey: brand.rawKey,
    canonicalName: brand.labels[0] ?? brandDisplayNameFromKey(brand.rawKey),
    shared: false,
  }));
  const privateGroups = Object.keys(mapping.privateAliases).length > 0
    ? groupsFromConfirmed(mapping.privateAliases, privateBrands, privateTargets)
    : suggestBrandMappingGroups(privateBrands, privateTargets);
  const fingerprint = brandSourceFingerprint(brands.map((brand) => brand.rawKey));
  const assigned = new Set(Object.keys(mapping.aliases));
  const complete = brands.every((brand) => assigned.has(brand.rawKey));
  const confirmed =
    mapping.confirmedAt !== null &&
    mapping.sourceFingerprint === fingerprint &&
    complete;
  const ready = confirmed;

  return {
    ready,
    status: ready ? "ready" : "needs_mapping",
    confirmedAt: mapping.confirmedAt,
    sourceFingerprint: fingerprint,
    brands,
    groups,
    targets,
    privateBrands,
    privateGroups,
  };
}
