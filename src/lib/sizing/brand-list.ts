import { normalizeBrandKey } from "./keys";

/** A brand a Part 2 sizing exception can be attached to: the key it is stored under, and the name
 *  to show. Structurally what `SizeTypePanel` takes. */
export interface SizingBrand {
  brandKey: string;
  name: string;
}

/**
 * Distinct brands, keyed for the Part 2 per-brand sizing exceptions.
 *
 * Keyed by `normalizeBrandKey` so an exception saved on Stage 1 still resolves after Stage 2 writes
 * coverage under the same keys, and so a catalog spelling one brand `LEVI'S` on some products and
 * `Levi's` on others offers a single row — two rows would let a merchant set two conflicting sizing
 * systems for one brand.
 */
export function toSizingBrands(names: readonly (string | null | undefined)[]): SizingBrand[] {
  const byKey = new Map<string, SizingBrand>();

  for (const raw of names) {
    const name = raw?.trim();
    if (!name) continue;

    const brandKey = normalizeBrandKey(name);
    // A name that normalizes to nothing (punctuation only) would land on `UNKNOWN_BRAND_KEY`, which
    // is what unbranded products resolve to — an exception stored there would apply to all of them.
    if (!brandKey || byKey.has(brandKey)) continue;

    byKey.set(brandKey, { brandKey, name });
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}
