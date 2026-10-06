/**
 * What a merchant's `variantOptions` group names mean, and what their names say they mean by default.
 *
 * Extracted here so the indexer and the merchant-facing mapping table share one definition. They
 * were copy-pasted before, which was survivable while the mapping was fixed and global. It stops
 * being survivable now that a merchant can reassign a group: two copies of the name sets means
 * Stage 1 can show `Size -> —` while `rawCatalogProductToAcsProduct` writes that same group into
 * `sizes`, and the merchant has no way to tell which one is lying.
 *
 * Deliberately free of Node built-ins and server imports — `mapping-fields.ts` and the Stage 1
 * table are client code, so anything reaching for `crypto` (see field-overrides.ts) has to stay
 * out of this module.
 */

/**
 * Where a merchant's option group can be sent. The six built-in buckets ACS has a predefined field
 * for, plus `"brand"` — which nothing maps to by default, since brand normally comes from
 * `RawCatalogProduct.brand` — and `"ignore"`, which drops a group instead of letting it fall into
 * the `opt_*` catch-all.
 */
export const VARIANT_ROLES = [
  "color",
  "size",
  "material",
  "pattern",
  "gender",
  "age_group",
  "brand",
  // Storable, not just a fallback: a merchant whose "Color" attribute holds something that is not a
  // colour needs a way to send it to the catch-all instead, and without this the only alternatives
  // were a wrong named field or dropping the data.
  "custom",
  "ignore",
] as const;

export type VariantRole = (typeof VARIANT_ROLES)[number];

/** A resolved destination. `"custom"` is the `opt_<name>` catch-all — a real destination, not a
 *  failure: the group still reaches ACS as a searchable custom attribute. Identical to
 *  `VariantRole` now that the catch-all is selectable; kept as its own name because the two mean
 *  different things — one is what a merchant may choose, the other what a group resolved to. */
export type OptionRole = VariantRole;

export function isVariantRole(value: unknown): value is VariantRole {
  return typeof value === "string" && (VARIANT_ROLES as readonly string[]).includes(value);
}

// ─── Built-in name matching ───────────────────────────────────────────────────

/**
 * The words stores use for a size or colour option, in the languages Persona's merchants publish in.
 * Compared after `optionNameTokens`, which lowercases, drops accents and expands `ß`, so `Größe`,
 * `GROSSE` and `grosse` are one entry. One list serves the indexer, Stage 1's default mapping, the
 * variant pickers and add-to-cart, so a store whose option is called `Taille` is a size everywhere or
 * nowhere rather than a size to the cart and a custom attribute to the catalog.
 */
const SIZE_WORDS = new Set([
  "size", "sizes", "taille", "tailles", "pointure", "talla", "tallas", "tamano", "tamanho",
  "tamanhos", "grosse", "groesse", "grossen", "maat", "maten", "taglia", "taglie", "storlek", "rozmiar",
  "مقاس", "المقاس", "مقاسات", "حجم", "الحجم", "قياس", "المقاسات",
]);
const COLOR_WORDS = new Set([
  "color", "colors", "colour", "colours", "couleur", "couleurs", "farbe", "farben", "colore", "colori",
  "kleur", "kleuren", "cor", "cores", "farg", "kolor", "renk",
  "لون", "اللون", "الوان", "ألوان", "الألوان",
]);

/** Lowercase words of an option name, with accents removed and `ß` written `ss`. Splits on anything
 *  that is not a letter or digit, which is also what peels a WooCommerce `pa_` / `attribute_pa_`
 *  prefix off the attribute slug. */
export function optionNameTokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function isSizeOptionName(name: string): boolean {
  return optionNameTokens(name).some((token) => SIZE_WORDS.has(token));
}

export function isColorOptionName(name: string): boolean {
  return optionNameTokens(name).some((token) => COLOR_WORDS.has(token));
}

/** What a storefront's option name means to the shopper-facing variant pickers. Size outranks colour,
 *  so an option named "Size / Color" is still offered as the size it has to be chosen as. */
export function variantTypeForOptionName(name: string): "size" | "color" | "style" {
  if (isSizeOptionName(name)) return "size";
  if (isColorOptionName(name)) return "color";
  return "style";
}

const MATERIAL_OPTION_NAMES = new Set(["material", "materials", "fabric"]);
const PATTERN_OPTION_NAMES = new Set(["pattern", "patterns", "print"]);
const GENDER_OPTION_NAMES = new Set(["gender", "genders", "sex"]);
const AGE_GROUP_OPTION_NAMES = new Set(["age group", "agegroup", "age_group", "age"]);

/** Normalization applied before any name match, so an override keyed `"shade"` matches a store's
 *  "Shade", "SHADE" or " shade " identically. */
export function normalizeOptionGroupName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * What an option group resolves to with no override — the built-in, global name match.
 *
 * Never returns `"brand"` or `"ignore"`: both are merchant intent that cannot be inferred from a
 * group's name, so they only ever arrive as an explicit override.
 */
export function detectDefaultVariantRole(normalizedName: string): OptionRole {
  if (isSizeOptionName(normalizedName)) return "size";
  if (isColorOptionName(normalizedName)) return "color";
  if (MATERIAL_OPTION_NAMES.has(normalizedName)) return "material";
  if (PATTERN_OPTION_NAMES.has(normalizedName)) return "pattern";
  if (GENDER_OPTION_NAMES.has(normalizedName)) return "gender";
  if (AGE_GROUP_OPTION_NAMES.has(normalizedName)) return "age_group";
  return "custom";
}

/** Prefix for the catch-all custom attribute any group resolving to `"custom"` lands in —
 *  namespaced so a store's own option name can never collide with this app's internal bookkeeping
 *  attributes (`merchant_id`, `source_category_ids`, ...), and so `attributes-config.ts`'s dynamic
 *  registration can recognize which keys it owns. */
export const CUSTOM_OPTION_ATTRIBUTE_PREFIX = "opt_";

/**
 * ACS `CatalogAttribute.key` is capped at 128 characters. This is called for every custom
 * attribute key ACS ever sees — a merchant's Table 2 attribute name, an unclassified option
 * group's `opt_<name>` catch-all (`customAttributeKeyFor`, below) — through one shared sanitizer,
 * so both callers stay under the limit without each having to know the other's own prefix budget.
 * Leaves room for `CUSTOM_OPTION_ATTRIBUTE_PREFIX` ("opt_", 4 characters), the longest prefix any
 * caller adds after this returns.
 */
const MAX_ATTRIBUTE_KEY_LENGTH = 124;

/** ACS custom-attribute keys may only contain alphanumerics and underscores, and cannot exceed
 *  ACS's own 128-character limit (see `MAX_ATTRIBUTE_KEY_LENGTH`). Merchant option names are free
 *  text (spacing, punctuation, mixed case, occasionally pasted paragraphs), so this collapses
 *  anything else to `_` and truncates — lossy, but stable and collision-resistant enough for the
 *  option names and attribute names real storefronts use. */
export function sanitizeAttributeKeySegment(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, MAX_ATTRIBUTE_KEY_LENGTH)
    // A truncation can itself leave a trailing underscore (the character right after the cut was
    // about to collapse into one) or start with a digit sequence that split mid-token; only the
    // trailing case is actually invalid ACS syntax, so only that is re-stripped.
    .replace(/_+$/, "");
}

/** The `opt_*` attribute key a group resolving to `"custom"` is written to, or null when its name
 *  sanitizes to nothing. */
export function customAttributeKeyFor(optionName: string): string | null {
  const key = sanitizeAttributeKeySegment(optionName);
  return key ? `${CUSTOM_OPTION_ATTRIBUTE_PREFIX}${key}` : null;
}

// The per-store mapping document that used to live here — which column feeds which ACS field, plus
// the merchant's declared custom attributes — moved to `acs-mapping.ts` when Stage 1 was inverted.
// This module is now only the option-group vocabulary: what a group can mean, and what its name says
// it means by default. `acs-mapping.ts` imports from here, never the other way round.
