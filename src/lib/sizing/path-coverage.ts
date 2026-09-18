import type { CategoryIndex } from "@/lib/catalog/category-parents";
import type { StoreCategory } from "@/modules/store/types";
import type { SizingPathCoverageInput } from "@/lib/db/sizing-path-coverage";
import { normalizeBrandKey, UNKNOWN_BRAND_KEY } from "./keys";
import type { SizingGroup } from "./measurements";

/**
 * Counts the scan into (brand x merchant category x sizing parent) rows for Stage 5.
 *
 * Runs inside the existing walk, over the rows already held in memory. Nothing new is fetched and
 * nothing per-product is stored: the whole output is a count per path, which is the only thing an
 * assignment screen can act on. A second pass over the catalog to get this would double the cost of
 * the one stage that touches every product.
 *
 * Products with no resolvable path are skipped rather than bucketed under a placeholder. Those are
 * Main-category-only products (excluded from sizing by the merchant's own answer) and Stage 2
 * hand-corrections whose categories are all containers — neither has a path a merchant could sensibly
 * assign a chart to, and inventing one would put a row on the screen that governs nothing.
 */
export class PathCoverageAggregator {
  private readonly rows = new Map<string, SizingPathCoverageInput>();
  private readonly seenProducts = new Set<string>();
  private readonly names: Map<string, string>;
  private readonly index: CategoryIndex;

  constructor(categories: readonly StoreCategory[], index: CategoryIndex) {
    this.names = new Map(categories.map((category) => [category.id, category.name]));
    this.index = index;
  }

  add(product: {
    brand: string | null;
    sizingGroup: SizingGroup | null;
    sizingCategoryId: string | null;
  }): void {
    if (!product.sizingGroup || !product.sizingCategoryId) return;
    this.addResolved(product.brand, product.sizingGroup, product.sizingCategoryId, this.breadcrumb(product.sizingCategoryId));
  }

  /** Universal Mapping path: the stable Persona key replaces the merchant category id. */
  addPersonaPath(product: {
    externalId: string;
    brand: string | null;
    sizingGroup: SizingGroup;
    pathKey: string;
    path: string[];
  }): void {
    const seenKey = `${product.externalId}\u0000${product.pathKey}\u0000${product.sizingGroup}`;
    if (this.seenProducts.has(seenKey)) return;
    this.seenProducts.add(seenKey);
    this.addResolved(product.brand, product.sizingGroup, product.pathKey, product.path);
  }

  private addResolved(
    brand: string | null,
    sizingGroup: SizingGroup,
    categoryId: string,
    categoryPath: string[],
  ): void {

    const brandKey = normalizeBrandKey(brand);
    const key = `${brandKey}\u0000${categoryId}\u0000${sizingGroup}`;

    const existing = this.rows.get(key);
    if (existing) {
      existing.skuCount += 1;
      return;
    }

    this.rows.set(key, {
      brandKey,
      // The merchant's own spelling, kept for display. Null for the unbranded sentinel, which has no
      // name to show — the screen labels that row itself.
      brandName: brandKey === UNKNOWN_BRAND_KEY ? null : (brand?.trim() ?? null),
      categoryId,
      categoryPath,
      sizingCategory: sizingGroup,
      skuCount: 1,
    });
  }

  /**
   * The category's ancestry, root first.
   *
   * Walked from the index rather than taken from `resolveCategoryPaths`, which returns every path a
   * product sits in with no way to say which one won. Bounded by the category count so a parent cycle
   * surviving `buildCategoryIndex` cannot hang the scan.
   */
  private breadcrumb(categoryId: string): string[] {
    const parts: string[] = [];
    let cursor: string | null = categoryId;
    let hops = 0;

    while (cursor !== null && hops <= this.index.parentOf.size) {
      parts.unshift(this.names.get(cursor) ?? cursor);
      cursor = this.index.parentOf.get(cursor) ?? null;
      hops += 1;
    }

    return parts;
  }

  /** Biggest paths first, so the assignment screen leads with the ones that govern real stock. */
  result(): SizingPathCoverageInput[] {
    return [...this.rows.values()].sort(
      (a, b) =>
        b.skuCount - a.skuCount ||
        a.brandKey.localeCompare(b.brandKey) ||
        a.categoryPath.join("/").localeCompare(b.categoryPath.join("/")) ||
        a.sizingCategory.localeCompare(b.sizingCategory)
    );
  }
}

/** The natural key both `sizing_path_coverage` and `sizing_chart_assignments` are unique on. */
export function pathKey(brandKey: string, categoryId: string, sizingCategory: string): string {
  return `${brandKey}\u0000${categoryId}\u0000${sizingCategory}`;
}
