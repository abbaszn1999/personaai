import { isSizeOptionName } from "@/lib/catalog/option-groups";
import { sizeLabelCandidates } from "./size-label-forms";

export interface VariantOption {
  name: string;
  value: string;
}

function sameSize(left: string, right: string): boolean {
  const forms = new Set(sizeLabelCandidates(right));
  return sizeLabelCandidates(left).some((form) => forms.has(form));
}

/**
 * The in-stock variant in the first of `sizes` that has one, so the cart receives the size the
 * shopper was shown rather than whichever variant happens to be listed first. Only options named
 * like a size are compared, unless the product names none, so a colour value never passes for a
 * size. Null when none of the sizes is in stock.
 */
export function pickSizedVariant<T>(
  variants: readonly T[],
  sizes: readonly string[],
  optionsOf: (variant: T) => VariantOption[],
  inStock: (variant: T) => boolean
): T | null {
  const named = variants.some((variant) => optionsOf(variant).some((option) => isSizeOptionName(option.name)));
  const sizeValues = (variant: T) =>
    optionsOf(variant)
      .filter((option) => !named || isSizeOptionName(option.name))
      .map((option) => option.value);
  for (const size of sizes) {
    const match = variants.find((variant) => inStock(variant) && sizeValues(variant).some((value) => sameSize(value, size)));
    if (match) return match;
  }
  return null;
}
