import type { PersonaCategoryMap } from "@/modules/store/mapping/persona-taxonomy";
import type { StoreCategory, StorePlatform } from "@/modules/store/types";
import { storeCategoryTrail } from "./persona-mapping";

/** One store collection or category a Persona leaf was mapped from, as a link a merchant can open. */
export interface LeafSourceLink {
  categoryId: string;
  name: string;
  /** The category's names from the root down, so two siblings both called "Tops" can be told apart. */
  trail: string[];
  productCount: number;
  /** Null when the store gave the category no handle, or the platform has no public category page. */
  url: string | null;
}

/**
 * The storefront page that lists a category's products.
 *
 * Shopify serves every collection at `/collections/<handle>`. WooCommerce's pretty category base is
 * configurable per site (`/product-category/` is only the default) and nested terms add their parents
 * to the path, so the query form is used instead: WordPress answers `?product_cat=<slug>` on any
 * permalink setting and redirects it to whatever the pretty URL is.
 */
export function storefrontCategoryUrl(
  platform: StorePlatform,
  storeUrl: string,
  category: Pick<StoreCategory, "handle">,
): string | null {
  const handle = category.handle?.trim();
  const base = storefrontBase(storeUrl);
  if (!handle || !base) return null;
  if (platform === "shopify") return `${base}/collections/${encodeURIComponent(handle)}`;
  if (platform === "woocommerce" || platform === "wordpress") {
    return `${base}/?product_cat=${encodeURIComponent(handle)}`;
  }
  return null;
}

/**
 * Every store category mapped straight to each Persona leaf, keyed by leaf.
 *
 * Only direct mappings. A WooCommerce child that inherits its parent's mapping is already listed on
 * the parent's own page, so adding it would repeat products under a second link.
 */
export function leafSourceLinks(
  mappings: PersonaCategoryMap,
  categories: readonly StoreCategory[],
  platform: StorePlatform,
  storeUrl: string,
): Record<string, LeafSourceLink[]> {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const links: Record<string, LeafSourceLink[]> = {};
  for (const [categoryId, mapping] of Object.entries(mappings)) {
    if (mapping.status !== "mapped" || !mapping.departmentId || !mapping.categoryId || !mapping.subCategory) continue;
    const category = byId.get(categoryId);
    if (!category) continue;
    const leafKey = `${mapping.departmentId}:${mapping.categoryId}:${mapping.subCategory}`;
    (links[leafKey] ??= []).push({
      categoryId,
      name: category.name,
      trail: storeCategoryTrail(categoryId, categories),
      productCount: category.productCount,
      url: storefrontCategoryUrl(platform, storeUrl, category),
    });
  }
  for (const list of Object.values(links)) {
    list.sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name));
  }
  return links;
}

function storefrontBase(storeUrl: string): string | null {
  const trimmed = storeUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
