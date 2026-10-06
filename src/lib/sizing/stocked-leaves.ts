import type { BrandType } from "@/lib/db/sizing-coverage";
import { resolveMappedBrandKey, type StoreBrandMapping } from "@/lib/sizing/brand-mapping";
import { stockedLeavesKey, type StockedLeaves } from "@/lib/sizing/chart-results";
import type { SizingPathCoverageRow } from "@/lib/db/sizing-path-coverage";
import { ALL_PERSONA_LEAF_KEYS, personaSizingGroup } from "@/modules/store/mapping/persona-taxonomy";

const STANDARD_LEAVES = new Set(ALL_PERSONA_LEAF_KEYS);

/**
 * What this store stocks per (canonical brand x sizing group), at leaf grain.
 *
 * Restricted to leaves a chart can actually claim: the merchant's mapped leaves that also exist in
 * the standard vocabulary. A merchant-defined leaf is dropped by `sanitizeCoverage` whenever a chart
 * is stored, so counting it here would leave a gap no chart can ever close.
 */
export function buildStockedLeaves(
  pathCoverage: readonly SizingPathCoverageRow[],
  brandTypes: ReadonlyMap<string, BrandType>,
  brandMapping: StoreBrandMapping,
  mappedLeaves: readonly string[]
): StockedLeaves {
  const mapped = new Set(mappedLeaves);
  const stocked: StockedLeaves = new Map();

  for (const path of pathCoverage) {
    const leaf = path.categoryId;
    if (path.skuCount <= 0 || !mapped.has(leaf) || !STANDARD_LEAVES.has(leaf)) continue;

    const group = personaSizingGroup(leaf.split(":")[1] ?? "");
    if (!group) continue;

    const brandKey =
      brandTypes.get(path.brandKey) === "global"
        ? resolveMappedBrandKey(path.brandKey, path.brandName, brandMapping).brandKey
        : path.brandKey;

    const key = stockedLeavesKey(brandKey, group);
    let leaves = stocked.get(key);
    if (!leaves) {
      leaves = new Map();
      stocked.set(key, leaves);
    }
    leaves.set(leaf, (leaves.get(leaf) ?? 0) + path.skuCount);
  }

  return stocked;
}
