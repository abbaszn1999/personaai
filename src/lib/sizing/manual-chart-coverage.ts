import type { Audience } from "./keys";
import {
  ALL_PERSONA_LEAF_KEYS,
  leafDisplayName,
  PERSONA_DEPARTMENTS,
} from "@/modules/store/mapping/persona-taxonomy";
import { audienceForPersonaPath, leafOfPersonaPath } from "./variant-match";

interface CoveragePath {
  brandKey: string;
  sizingCategory: string;
  categoryId: string;
}

/**
 * Exact Persona leaves whose products created a manual-chart gap.
 *
 * The parent sizing group is not coverage: four "tops" leaves may need four different tables.
 * Brand matching is exact as well, including the no-brand sentinel, so private and null-brand stock
 * cannot borrow another brand's mapped paths.
 */
export function manualChartLeaves(
  paths: readonly CoveragePath[],
  brandKey: string,
  sizingCategory: string,
  seedLeaves: readonly string[] = [],
): string[] {
  return [
    ...new Set([
      ...seedLeaves.filter(isPersonaLeaf),
      ...paths
        .filter(
          (path) =>
            path.brandKey === brandKey &&
            path.sizingCategory === sizingCategory &&
            isPersonaLeaf(path.categoryId),
        )
        .map((path) => path.categoryId),
    ]),
  ];
}

export function manualChartAudiences(leaves: readonly string[]): Audience[] {
  return [
    ...new Set(
      leaves
        .map((leaf) => audienceForPersonaPath(leaf))
        .filter((audience): audience is Audience => audience !== null),
    ),
  ];
}

/**
 * A readable default name for a chart covering these leaves, e.g. `Men - Polo-Shirt, Shirt`. The name
 * only tells a merchant two tables apart, so it is derived from what the table covers rather than left
 * blank (which led every chart to be saved as "Regular" and collide).
 */
export function suggestChartName(leaves: readonly string[]): string {
  const byDepartment = new Map<string, string[]>();
  for (const leaf of leaves) {
    const [label, sub] = leafDisplayName(leaf).split(" · ");
    if (!label || !sub) continue;
    const subs = byDepartment.get(label) ?? [];
    if (!subs.includes(sub)) subs.push(sub);
    byDepartment.set(label, subs);
  }

  return [...byDepartment]
    .map(([department, subs]) => {
      const sorted = [...subs].sort();
      const shown = sorted.slice(0, 3).join(", ");
      return `${department} - ${shown}${sorted.length > 3 ? ` +${sorted.length - 3}` : ""}`;
    })
    .join(" / ");
}

export interface DepartmentLeaves {
  departmentId: string;
  audience: Audience;
  /** Every leaf of this department the dialog lists, in taxonomy order. */
  leaves: string[];
  /** The ones still without a chart. */
  open: string[];
}

/**
 * The Fill chart dialog's first screen: one entry per department the brand stocks in this group.
 *
 * A chart is one body block, so it is filled one department at a time; a merchant picks Women, then
 * the women's subcategories that one printed table fits.
 */
export function departmentLeaves(leaves: readonly string[], charted: ReadonlySet<string>): DepartmentLeaves[] {
  const order = new Map(ALL_PERSONA_LEAF_KEYS.map((leaf, index) => [leaf, index]));
  const unique = [...new Set(leaves)].filter(isPersonaLeaf);
  return PERSONA_DEPARTMENTS.flatMap((dept) => {
    const own = unique
      .filter((leaf) => leaf.startsWith(`${dept.id}:`))
      .sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity) || a.localeCompare(b));
    const audience = audienceForPersonaPath(`${dept.id}:`);
    if (own.length === 0 || !audience) return [];
    return [{ departmentId: dept.id, audience, leaves: own, open: own.filter((leaf) => !charted.has(leaf)) }];
  });
}

function isPersonaLeaf(categoryId: string): boolean {
  return Boolean(leafOfPersonaPath(categoryId) && audienceForPersonaPath(categoryId));
}
