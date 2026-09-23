import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";
import type { SizingRunRow } from "@/lib/db/sizing-runs";
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

export type BrandMappingStatus = "needs_mapping" | "rescanning" | "ready";

export interface BrandMappingState {
  ready: boolean;
  status: BrandMappingStatus;
  confirmedAt: string | null;
  sourceFingerprint: string;
  brands: DiscoveredBrand[];
  groups: BrandMappingGroup[];
  targets: CanonicalBrandTarget[];
}

function discoveredGlobalBrands(
  coverage: readonly SizingCoverageRow[],
  mapping: StoreBrandMapping,
): DiscoveredBrand[] {
  const canonicalTargets = new Set(Object.values(mapping.aliases).map((alias) => alias.canonicalKey));
  const aggregate = new Map<string, DiscoveredBrand>();

  // Persisted aliases retain the store spellings after coverage has merged onto canonical keys.
  for (const [rawKey, alias] of Object.entries(mapping.aliases)) {
    aggregate.set(rawKey, {
      rawKey,
      labels: mapping.observed[rawKey] ?? alias.labels,
      skuCount: alias.skuCount,
      sizingCategories: [...alias.sizingCategories],
    });
  }

  for (const row of coverage) {
    if (row.brandType !== "global" || !row.brandKey) continue;
    // Once confirmed, a canonical coverage row is the output of mapping, not a newly discovered raw
    // alias. A raw key not represented by a target is new and must reopen the gate.
    if (
      mapping.confirmedAt &&
      (canonicalTargets.has(row.brandKey) || mapping.aliases[row.brandKey] !== undefined)
    ) {
      continue;
    }

    const current = aggregate.get(row.brandKey) ?? {
      rawKey: row.brandKey,
      labels: mapping.observed[row.brandKey] ?? [],
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
  mapping: StoreBrandMapping,
  brands: readonly DiscoveredBrand[],
  targets: readonly CanonicalBrandTarget[],
): BrandMappingGroup[] {
  const expected = new Set(brands.map((brand) => brand.rawKey));
  const shared = new Set(targets.filter((target) => target.shared).map((target) => target.canonicalKey));
  const grouped = new Map<string, BrandMappingGroup>();
  const assigned = new Set<string>();

  for (const [rawKey, alias] of Object.entries(mapping.aliases)) {
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
  run: SizingRunRow | null;
}): BrandMappingState {
  const { coverage, run } = input;
  const mapping = parseStoreBrandMapping(input.mapping);
  const brands = discoveredGlobalBrands(coverage, mapping);
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
    ? groupsFromConfirmed(mapping, brands, targets)
    : suggestBrandMappingGroups(brands, targets);
  const fingerprint = brandSourceFingerprint(brands.map((brand) => brand.rawKey));
  const assigned = new Set(Object.keys(mapping.aliases));
  const complete = brands.every((brand) => assigned.has(brand.rawKey));
  const confirmed =
    mapping.confirmedAt !== null &&
    mapping.sourceFingerprint === fingerprint &&
    complete;
  const rescanning =
    confirmed && (run?.stage === "scan" || run?.stage === "classify" || run?.status === "pending" || run?.status === "running");
  const ready = confirmed && !rescanning;

  return {
    ready,
    status: ready ? "ready" : rescanning ? "rescanning" : "needs_mapping",
    confirmedAt: mapping.confirmedAt,
    sourceFingerprint: fingerprint,
    brands,
    groups,
    targets,
  };
}
