import type { PersonaCategoryMap } from "@/modules/store/mapping/persona-taxonomy";
import type { AcsFieldMapping } from "./acs-mapping";
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

/**
 * Where a store keeps the brand it is classified on, as far as a storefront URL can filter by it.
 * Mirrors the order `resolveProductBrand` reads in, so the link filters on the field the brand came
 * from rather than on whatever the platform happens to expose.
 */
export type BrandFilterSource =
  /** The platform's own brand: Shopify's vendor, WooCommerce's Brands taxonomy. */
  | { kind: "vendor" }
  /** A variant option group the merchant assigned to brand. */
  | { kind: "option"; group: string }
  /** A Shopify product metafield (`namespace.key`). */
  | { kind: "metafield"; namespace: string; key: string }
  /** Read from somewhere a URL cannot filter — a WooCommerce custom field, a variant field. */
  | { kind: "none" };

export function brandFilterSource(mapping: AcsFieldMapping): BrandFilterSource {
  const bound = mapping.sources.brand;
  if (bound) {
    if (bound.kind === "option") return { kind: "option", group: bound.group };
    if (bound.kind === "field") return bound.key === "brand" ? { kind: "vendor" } : { kind: "none" };
    if (bound.kind === "meta") {
      const match = /^metafield\.([^.]+)\.(.+)$/.exec(bound.key);
      return match ? { kind: "metafield", namespace: match[1], key: match[2] } : { kind: "none" };
    }
    if (bound.kind !== "unmapped") return { kind: "none" };
  }
  // A group reassigned to brand through its role rather than a binding.
  for (const [group, role] of Object.entries(mapping.optionRoles)) {
    if (role === "brand") return { kind: "option", group };
  }
  return { kind: "vendor" };
}

/** A WooCommerce Brands term, looked up by name to turn a brand label into its slug and id. */
export interface WooBrandTerm {
  id: number;
  name: string;
  slug: string;
}

export interface BrandFilterLink {
  /** The collection with the brand filter applied, or the plain collection when it cannot be. */
  url: string | null;
  /** True when `url` carries a filter that narrows to the brand. False means it opens the whole collection. */
  filtered: boolean;
  /** Shopify only: the store's own all-products-by-vendor page, which always works for vendor brands. */
  vendorPageUrl: string | null;
}

const COMBINING_MARKS = /[\u0300-\u036f]/g;

const termKey = (value: string) =>
  value.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * A collection page already narrowed to one brand.
 *
 * Shopify takes `filter.p.vendor=<label>` (repeated for several spellings of the same brand) and
 * `filter.v.option.<group>` / `filter.p.m.<ns>.<key>`. A filter only applies when the theme supports
 * storefront filtering and that filter is enabled in Search & Discovery, which the caller checks
 * separately; the parameter is sent either way and is simply ignored where it cannot apply.
 *
 * WooCommerce takes the Brands taxonomy as a query variable beside the category (`product_brand`,
 * by slug) and a global attribute through its layered-nav parameter. Anything else yields the plain
 * collection link and `filtered: false`, so the UI can say so instead of implying a narrowed list.
 */
export function storefrontBrandFilterUrl(input: {
  platform: StorePlatform;
  storeUrl: string;
  category: Pick<StoreCategory, "handle">;
  source: BrandFilterSource;
  /** Every spelling of the brand the store uses in this collection. */
  labels: readonly string[];
  /** WooCommerce Brands terms; needed to find a brand's slug and id. */
  wooBrands?: readonly WooBrandTerm[];
}): BrandFilterLink {
  const { platform, storeUrl, category, source } = input;
  const labels = [...new Set(input.labels.map((label) => label.trim()).filter(Boolean))];
  const plain = storefrontCategoryUrl(platform, storeUrl, category);
  const base = storefrontBase(storeUrl);
  const unfiltered: BrandFilterLink = { url: plain, filtered: false, vendorPageUrl: null };
  if (!plain || !base || labels.length === 0 || source.kind === "none") return unfiltered;

  if (platform === "shopify") {
    const parameter =
      source.kind === "vendor"
        ? "filter.p.vendor"
        : source.kind === "option"
          ? `filter.v.option.${source.group}`
          : `filter.p.m.${source.namespace}.${source.key}`;
    // One parameter per spelling rather than a comma list: a vendor name may itself contain a comma.
    const query = labels.map((label) => `${encodeURIComponent(parameter)}=${encodeURIComponent(label)}`).join("&");
    return {
      url: `${plain}?${query}`,
      filtered: true,
      vendorPageUrl: source.kind === "vendor" ? `${base}/collections/vendors?q=${encodeURIComponent(labels[0])}` : null,
    };
  }

  if (platform === "woocommerce" || platform === "wordpress") {
    if (source.kind === "vendor") {
      const wanted = new Set(labels.map(termKey));
      const terms = (input.wooBrands ?? []).filter((term) => wanted.has(termKey(term.name)));
      if (terms.length === 0) return unfiltered;
      const slugs = terms.map((term) => term.slug).join(",");
      const ids = terms.map((term) => term.id).join(",");
      return {
        url: `${plain}&product_brand=${encodeURIComponent(slugs)}&filtering=1&filter_product_brand=${encodeURIComponent(ids)}`,
        filtered: true,
        vendorPageUrl: null,
      };
    }
    if (source.kind === "option") {
      const slugs = labels.map(slugify).filter(Boolean).join(",");
      if (!slugs) return unfiltered;
      return {
        url: `${plain}&filtering=1&filter_${encodeURIComponent(slugify(source.group))}=${encodeURIComponent(slugs)}`,
        filtered: true,
        vendorPageUrl: null,
      };
    }
  }

  return unfiltered;
}

function storefrontBase(storeUrl: string): string | null {
  const trimmed = storeUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
