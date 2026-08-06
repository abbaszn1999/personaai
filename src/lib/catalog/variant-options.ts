import type { Product, ProductVariant } from "@/modules/shopping-agent/types";

export interface VariantOptionGroup {
  type: ProductVariant["type"];
  /** Distinct option values for this type, in first-seen order (e.g. ["S", "M", "L"]). */
  options: string[];
}

/**
 * `Product.variants` is flattened one row per (real variant x selected option) pair — see
 * `mapShopifyProductNode` in `src/lib/shopify/client.ts`. A variant with size=M + color=Red
 * produces two `ProductVariant` rows that share the same `id`. This groups those rows back up
 * by option `type` (Size, Color, ...) so a picker UI can render one selector per type.
 */
export function getVariantOptionGroups(product: Product): VariantOptionGroup[] {
  const seen = new Map<ProductVariant["type"], string[]>();

  for (const v of product.variants) {
    const values = seen.get(v.type);
    if (values) {
      if (!values.includes(v.label)) values.push(v.label);
    } else {
      seen.set(v.type, [v.label]);
    }
  }

  return Array.from(seen.entries()).map(([type, options]) => ({ type, options }));
}

/** How many distinct real variants (by `id`) this product actually has — a single-variant
 *  (or no-variant) product has nothing meaningful to choose between. */
function distinctVariantIds(product: Product): Set<string> {
  return new Set(product.variants.map((v) => v.id));
}

/** True only when the shopper actually has more than one real variant to choose from — a
 *  single-variant product should keep today's one-click add-to-cart behavior. */
export function hasSelectableVariants(product: Product): boolean {
  return distinctVariantIds(product).size > 1;
}

/**
 * Resolves the single real variant id whose option values match every entry in `selection`
 * (e.g. `{ size: "M", color: "Red" }`), by grouping the flattened `product.variants` rows back
 * up by `id`. Returns null if no variant matches (incomplete selection, or an option
 * combination Shopify doesn't actually sell).
 */
export function resolveVariantIdForSelection(
  product: Product,
  selection: Partial<Record<ProductVariant["type"], string>>
): string | null {
  const selectedTypes = Object.entries(selection).filter(([, value]) => !!value) as Array<
    [ProductVariant["type"], string]
  >;
  if (selectedTypes.length === 0) return null;

  const byId = new Map<string, ProductVariant[]>();
  for (const v of product.variants) {
    const group = byId.get(v.id);
    if (group) group.push(v);
    else byId.set(v.id, [v]);
  }

  for (const [id, rows] of byId) {
    const matchesAll = selectedTypes.every(([type, value]) =>
      rows.some((r) => r.type === type && r.label === value)
    );
    if (matchesAll) return id;
  }

  return null;
}
