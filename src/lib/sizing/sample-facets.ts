import { formatPersonaSegments } from "@/modules/store/mapping/persona-taxonomy";
import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";
import { facetsHaveSources, sourceCountsFromFacets, type SizingFacetRow } from "./record-facets";

export interface SampleFacetBrand {
  brandKey: string;
  name: string;
  type: SizingCoverageRow["brandType"];
  count: number;
}

/** One entry of the cascading Persona path filter. `key` is what the server filters on: a trailing
 *  colon for a department or category, a bare leaf key for one subcategory. */
export interface SampleFacetPath {
  key: string;
  label: string;
  depth: 1 | 2 | 3;
  count: number;
}

export interface SampleFacetCollection {
  id: string;
  name: string;
  /** Root first, for telling two collections with the same name apart. */
  trail: string[];
  count: number;
}

export interface SizingSampleFacets {
  brands: SampleFacetBrand[];
  paths: SampleFacetPath[];
  collections: SampleFacetCollection[];
  /** False for a snapshot saved before collections were recorded, which a rescan fills. */
  hasCollections: boolean;
}

function brandsFrom(coverage: SizingCoverageRow[]): SampleFacetBrand[] {
  const brands = new Map<string, SampleFacetBrand>();
  for (const row of coverage) {
    // The unbranded sentinel has its own chip; it is not something to pick from a brand list.
    if (!row.brandKey) continue;
    const entry = brands.get(row.brandKey);
    if (entry) entry.count += row.skuCount;
    else {
      brands.set(row.brandKey, {
        brandKey: row.brandKey,
        name: row.brandName ?? row.brandKey,
        type: row.brandType,
        count: row.skuCount,
      });
    }
  }
  return [...brands.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Departments, then their categories, then their subcategories, each with the items under it. Built
 * from the exact per-leaf counts, so a department's number is the sum of its own leaves.
 */
export function pathFacetsFrom(byLeaf: Record<string, number>): SampleFacetPath[] {
  const departments = new Map<string, number>();
  const categories = new Map<string, number>();
  const leaves: SampleFacetPath[] = [];

  for (const [leafKey, count] of Object.entries(byLeaf)) {
    const [dept, category, sub] = leafKey.split(":");
    if (!dept || !category || !sub || count <= 0) continue;
    departments.set(dept, (departments.get(dept) ?? 0) + count);
    categories.set(`${dept}:${category}`, (categories.get(`${dept}:${category}`) ?? 0) + count);
    leaves.push({ key: leafKey, label: formatPersonaSegments(["persona", dept, category, sub]), depth: 3, count });
  }

  const paths: SampleFacetPath[] = [
    ...[...departments].map(([dept, count]): SampleFacetPath => ({
      key: `${dept}:`,
      label: formatPersonaSegments(["persona", dept]),
      depth: 1,
      count,
    })),
    ...[...categories].map(([key, count]): SampleFacetPath => {
      const [dept, category] = key.split(":");
      return { key: `${key}:`, label: formatPersonaSegments(["persona", dept, category]), depth: 2, count };
    }),
    ...leaves,
  ];
  return paths.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Everything the Stage 2 filter dropdowns offer, with counts.
 *
 * Brands come from coverage and paths from the exact leaf counts, so both match the numbers on the
 * chips. Collections come from the saved snapshot's facet rows and are named from the store's own
 * category tree.
 */
export function buildSampleFacets(input: {
  coverage: SizingCoverageRow[];
  leafCounts: Record<string, number>;
  facetRows: SizingFacetRow[] | null;
  categories: ReadonlyArray<{ id: string; name: string; parentId?: string | null }>;
}): SizingSampleFacets {
  const byId = new Map(input.categories.map((category) => [category.id, category]));
  const trailOf = (id: string): string[] => {
    const names: string[] = [];
    const seen = new Set<string>();
    let cursor = byId.get(id);
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      names.unshift(cursor.name);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return names;
  };

  const rows = input.facetRows ?? [];
  const collections = sourceCountsFromFacets(rows)
    .map(({ key, count }): SampleFacetCollection => {
      const trail = trailOf(key);
      return { id: key, name: trail.at(-1) ?? key, trail, count };
    })
    .sort((a, b) => a.trail.join(" / ").localeCompare(b.trail.join(" / ")));

  return {
    brands: brandsFrom(input.coverage),
    paths: pathFacetsFrom(input.leafCounts),
    collections,
    hasCollections: facetsHaveSources(rows),
  };
}
