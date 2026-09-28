import type { Audience } from "./keys";
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

function isPersonaLeaf(categoryId: string): boolean {
  return Boolean(leafOfPersonaPath(categoryId) && audienceForPersonaPath(categoryId));
}
