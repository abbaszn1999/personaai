import type { ResearchStatus, SizingCoverageRow } from "@/lib/db/sizing-coverage";
import {
  parseStoreBrandMapping,
  resolveChartBrandKey,
  resolveChartBrandName,
  type StoreBrandMapping,
} from "./brand-mapping";

export interface CanonicalBrandMember {
  brandKey: string;
  brandName: string;
  skuCount: number;
}

export interface CanonicalCoverageView {
  rows: SizingCoverageRow[];
  membersByCanonicalKey: Map<string, CanonicalBrandMember[]>;
  rawKeysByCanonicalKey: Map<string, string[]>;
}

const STATUS_PRIORITY: Record<ResearchStatus, number> = {
  failed: 5,
  not_found: 4,
  not_covered: 3,
  pending: 2,
  found: 1,
};

function mergeResearchStatus(a: ResearchStatus, b: ResearchStatus): ResearchStatus {
  return STATUS_PRIORITY[a] >= STATUS_PRIORITY[b] ? a : b;
}

function mergeStringCounts(
  left: Record<string, number>,
  right: Record<string, number>,
): Record<string, number> {
  const merged = { ...left };
  for (const [key, count] of Object.entries(right)) merged[key] = (merged[key] ?? 0) + count;
  return merged;
}

function uniquePaths(paths: readonly string[][]): string[][] {
  const seen = new Set<string>();
  return paths.filter((path) => {
    const key = path.join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Produces the Phase 4 chart-routing view without mutating or persisting coverage.
 * Global brands merge through the shared-registry aliases and private labels through the store's
 * own grouping; unbranded rows, and any label nobody grouped, retain their raw identity.
 */
export function canonicalizeCoverageForCharts(
  coverage: readonly SizingCoverageRow[],
  mapping: StoreBrandMapping,
): CanonicalCoverageView {
  const parsedMapping = parseStoreBrandMapping(mapping);
  const grouped = new Map<string, SizingCoverageRow>();
  const memberTotals = new Map<string, Map<string, CanonicalBrandMember>>();
  const rawKeys = new Map<string, Set<string>>();

  for (const row of coverage) {
    const resolved =
      row.brandType === "global" || row.brandType === "private"
        ? {
            brandKey: resolveChartBrandKey(row.brandKey, row.brandType, parsedMapping),
            brandName: resolveChartBrandName(row.brandKey, row.brandName, row.brandType, parsedMapping),
          }
        : { brandKey: row.brandKey, brandName: row.brandName };
    // The pool is part of the key: a global and a private brand never share charts, so even a
    // colliding key must not merge their coverage.
    const groupKey = `${row.brandType}\u0000${resolved.brandKey}\u0000${row.sizingCategory}`;
    const current = grouped.get(groupKey);

    if (!current) {
      grouped.set(groupKey, {
        ...row,
        id: `canonical:${resolved.brandKey}:${row.sizingCategory}`,
        brandKey: resolved.brandKey,
        brandName: resolved.brandName,
        brandCanonicalName: resolved.brandName,
        storeCategoryPaths: row.storeCategoryPaths.map((path) => [...path]),
        sampleSkus: row.sampleSkus.map((sample) => ({ ...sample })),
        rawFormats: structuredClone(row.rawFormats),
        audienceHints: { ...row.audienceHints },
      });
    } else {
      current.skuCount += row.skuCount;
      current.storeCategoryPaths = uniquePaths([
        ...current.storeCategoryPaths,
        ...row.storeCategoryPaths.map((path) => [...path]),
      ]);
      current.sampleSkus = [...current.sampleSkus, ...row.sampleSkus.map((sample) => ({ ...sample }))].slice(0, 5);
      for (const [format, value] of Object.entries(row.rawFormats)) {
        const existing = current.rawFormats[format];
        current.rawFormats[format] = existing
          ? { count: existing.count + value.count }
          : structuredClone(value);
      }
      current.audienceHints = mergeStringCounts(current.audienceHints, row.audienceHints);
      current.researchStatus = mergeResearchStatus(current.researchStatus, row.researchStatus);
      current.researchNote ??= row.researchNote;
    }

    if (row.brandType !== "global" && row.brandType !== "private") continue;
    let members = memberTotals.get(resolved.brandKey);
    if (!members) {
      members = new Map();
      memberTotals.set(resolved.brandKey, members);
    }
    const member = members.get(row.brandKey);
    if (member) member.skuCount += row.skuCount;
    else {
      members.set(row.brandKey, {
        brandKey: row.brandKey,
        brandName: row.brandName ?? row.brandKey,
        skuCount: row.skuCount,
      });
    }
    let keys = rawKeys.get(resolved.brandKey);
    if (!keys) {
      keys = new Set();
      rawKeys.set(resolved.brandKey, keys);
    }
    keys.add(row.brandKey);
  }

  return {
    rows: [...grouped.values()],
    membersByCanonicalKey: new Map(
      [...memberTotals].map(([key, members]) => [
        key,
        [...members.values()].sort((a, b) => a.brandName.localeCompare(b.brandName)),
      ]),
    ),
    rawKeysByCanonicalKey: new Map([...rawKeys].map(([key, values]) => [key, [...values]])),
  };
}

