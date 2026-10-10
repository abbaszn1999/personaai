import { isColorOptionName, isSizeOptionName } from "@/lib/catalog/option-groups";
import { colourWords, comparableAttributeValue } from "@/lib/catalog/path-config/lookup";
import { sizeLabelCandidates } from "./size-label-forms";

export interface VariantOption {
  name: string;
  value: string;
}

function sameSize(left: string, right: string): boolean {
  const forms = new Set(sizeLabelCandidates(right));
  return sizeLabelCandidates(left).some((form) => forms.has(form));
}

const COLOUR = { key: "color", field: "colors" } as const;

/** One colour the shopper asked for against a variant's colour value: the same colour in any
 *  spelling ("N.BLUE" is "Navy"), or a shade named with it ("Blue" covers "Light Blue"). */
export function sameColour(value: string, wanted: string): boolean {
  if (comparableAttributeValue(COLOUR, value) === comparableAttributeValue(COLOUR, wanted)) return true;
  const words = new Set(colourWords(value));
  const asked = colourWords(wanted);
  return asked.length > 0 && asked.every((word) => words.has(word));
}

/**
 * The in-stock variant in the first of `sizes` that has one, so the cart receives the size the
 * shopper was shown rather than whichever variant happens to be listed first. Only options named
 * like a size are compared, unless the product names none, so a colour value never passes for a
 * size. Null when none of the sizes is in stock.
 *
 * With `colors` (what the shopper asked for), only variants in one of them are considered when the
 * product sells any: a navy request never becomes a white shirt in the right size. A colour none of
 * the product's colour options carries (the store spells colour elsewhere) narrows nothing.
 */
export function pickSizedVariant<T>(
  variants: readonly T[],
  sizes: readonly string[],
  optionsOf: (variant: T) => VariantOption[],
  inStock: (variant: T) => boolean,
  colors: readonly string[] = []
): T | null {
  const named = variants.some((variant) => optionsOf(variant).some((option) => isSizeOptionName(option.name)));
  const sizeValues = (variant: T) =>
    optionsOf(variant)
      .filter((option) => !named || isSizeOptionName(option.name))
      .map((option) => option.value);
  const inColour = (variant: T) =>
    optionsOf(variant).some(
      (option) =>
        isColorOptionName(option.name) &&
        !isSizeOptionName(option.name) &&
        colors.some((colour) => sameColour(option.value, colour))
    );
  const pool = colors.length > 0 && variants.some(inColour) ? variants.filter(inColour) : variants;
  for (const size of sizes) {
    const match = pool.find((variant) => inStock(variant) && sizeValues(variant).some((value) => sameSize(value, size)));
    if (match) return match;
  }
  return null;
}

/** What the shopper reads when `pickSizedVariant` finds nothing to add. */
export function soldOutMessage(sizes: readonly string[], colors: readonly string[] = []): string {
  const colour = colors.length > 0 ? ` in ${colors.join(" / ")}` : "";
  return `Size ${sizes.join(" / ")}${colour} just sold out for this item.`;
}
