import { normalizeBrandKey } from "./keys";

/**
 * Doc Part 2 — the sizing system the merchant's catalog is actually written in.
 *
 * This is a declaration, not a conversion instruction. The doc explicitly drops the old requirement
 * to generate US, UK and EU charts simultaneously: a store whose labels read `EU 38` is matched
 * against the EU column of a brand's guide, and no other column is synthesised. Generating all three
 * meant inventing two thirds of every chart from conversion tables that brands do not agree with,
 * and then filtering shoppers on the invented part.
 *
 * It becomes the fourth component of the resolved chart id in Phase 9 — `nike_tops_men_alpha` — so
 * two merchants selling the same brand in different label systems resolve to different charts
 * rather than quietly sharing one.
 */
export const SIZE_TYPES = ["US", "UK", "EU", "Alpha", "Numeric"] as const;

export type SizeType = (typeof SIZE_TYPES)[number];

/**
 * Default for a store that has never answered.
 *
 * `Alpha` rather than a region, because S/M/L is the one system that is not a claim about where the
 * store is: guessing `EU` from a `.gr` domain would be a regional assertion nobody made, and a wrong
 * one silently matches the wrong column of every chart. Alpha is also the most common labelling in
 * the catalogs this runs against.
 */
export const DEFAULT_SIZE_TYPE: SizeType = "Alpha";

export const SIZE_TYPE_LABELS: Record<SizeType, string> = {
  US: "US sizing",
  UK: "UK sizing",
  EU: "EU sizing",
  Alpha: "Alpha (S / M / L)",
  Numeric: "Numeric (28–38)",
};

/** What each one looks like in a catalog, so the merchant recognises their own labels rather than
 *  having to reason about what the name means. */
export const SIZE_TYPE_EXAMPLES: Record<SizeType, string> = {
  US: "US 4, US 6, US 8 — US numeric and US footwear",
  UK: "UK 8, UK 10, UK 12 — UK numeric and UK footwear",
  EU: "EU 36, EU 38, EU 40 — continental numeric and EU footwear",
  Alpha: "XS, S, M, L, XL, XXL",
  Numeric: "28, 30, 32 — waist, dress or plain numeric grading",
};

/** Brand key to the system that brand is labelled in, for the brands that differ from the store
 *  default. Keyed on the normalized brand key rather than the display name, the same way coverage
 *  and `sizing_charts` are, so casing and punctuation in the catalog cannot orphan an override. */
export type SizeTypeOverrides = Record<string, SizeType>;

export function isSizeType(value: unknown): value is SizeType {
  return typeof value === "string" && (SIZE_TYPES as readonly string[]).includes(value);
}

/**
 * The system one brand's labels are in: its override if it has one, otherwise the store default.
 *
 * The single reader of both fields. Phase 9 keys charts on the answer, so a second place deciding it
 * would produce two different chart ids for one product.
 */
export function sizeTypeFor(
  brand: string | null | undefined,
  storeDefault: SizeType,
  overrides: SizeTypeOverrides
): SizeType {
  const override = overrides[normalizeBrandKey(brand)];
  return isSizeType(override) ? override : storeDefault;
}

/** Validates a store size type arriving over the wire, falling back to the default rather than
 *  rejecting: an unrecognised value is a stale tab, and refusing the whole save would also lose the
 *  brand overrides sent alongside it. */
export function parseSizeType(value: unknown): SizeType {
  return isSizeType(value) ? value : DEFAULT_SIZE_TYPE;
}

/** Same contract as the parent-map parsers: entries naming a system this build does not have are
 *  dropped, and those brands fall back to the store default. */
export function parseSizeTypeOverrides(value: unknown): SizeTypeOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const parsed: SizeTypeOverrides = {};
  for (const [brandKey, system] of Object.entries(value as Record<string, unknown>)) {
    if (brandKey && isSizeType(system)) parsed[brandKey] = system;
  }
  return parsed;
}
