/**
 * How a merchant's `variantOptions` group names resolve to ACS fields, and the per-store overrides
 * on top of that.
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
  "ignore",
] as const;

export type VariantRole = (typeof VARIANT_ROLES)[number];

/** A resolved destination. `"custom"` is the `opt_<name>` catch-all — a real destination, not a
 *  failure: the group still reaches ACS as a searchable custom attribute. */
export type OptionRole = VariantRole | "custom";

export function isVariantRole(value: unknown): value is VariantRole {
  return typeof value === "string" && (VARIANT_ROLES as readonly string[]).includes(value);
}

// ─── Built-in name matching ───────────────────────────────────────────────────

const COLOR_OPTION_NAMES = new Set(["color", "colour"]);
const SIZE_OPTION_NAMES = new Set(["size"]);
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
  if (COLOR_OPTION_NAMES.has(normalizedName)) return "color";
  if (SIZE_OPTION_NAMES.has(normalizedName)) return "size";
  if (MATERIAL_OPTION_NAMES.has(normalizedName)) return "material";
  if (PATTERN_OPTION_NAMES.has(normalizedName)) return "pattern";
  if (GENDER_OPTION_NAMES.has(normalizedName)) return "gender";
  if (AGE_GROUP_OPTION_NAMES.has(normalizedName)) return "age_group";
  return "custom";
}

/** The one place that decides where a group goes: the merchant's override if they set one, the
 *  built-in match otherwise. Both the mapper and the Stage 1 table call this. */
export function resolveOptionRole(normalizedName: string, optionRoles: Record<string, VariantRole>): OptionRole {
  return optionRoles[normalizedName] ?? detectDefaultVariantRole(normalizedName);
}

/** Prefix for the catch-all custom attribute any group resolving to `"custom"` lands in —
 *  namespaced so a store's own option name can never collide with this app's internal bookkeeping
 *  attributes (`merchant_id`, `source_category_ids`, ...), and so `attributes-config.ts`'s dynamic
 *  registration can recognize which keys it owns. */
export const CUSTOM_OPTION_ATTRIBUTE_PREFIX = "opt_";

/** ACS custom-attribute keys may only contain alphanumerics and underscores. Merchant option names
 *  are free text (spacing, punctuation, mixed case), so this collapses anything else to `_` —
 *  lossy, but stable and collision-resistant enough for the option names real storefronts use. */
export function sanitizeAttributeKeySegment(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/** The `opt_*` attribute key a group resolving to `"custom"` is written to, or null when its name
 *  sanitizes to nothing. */
export function customAttributeKeyFor(optionName: string): string | null {
  const key = sanitizeAttributeKeySegment(optionName);
  return key ? `${CUSTOM_OPTION_ATTRIBUTE_PREFIX}${key}` : null;
}

// ─── Per-store overrides ──────────────────────────────────────────────────────

/**
 * A connection's field-mapping overrides. The empty value reproduces the mapper's default output
 * exactly, so every existing connection has this shape until a merchant changes something.
 *
 * Only option-group routing is overridable. Whole-field suppression was deliberately dropped: the
 * suppressible set included `price`, `images` and `brand`, and hiding those breaks the agent's
 * product cards and brand identification respectively, while `Documentation/persona_sizing.md`
 * asks only that a merchant *map* their columns. The column is jsonb, so adding it back later
 * needs no migration.
 */
export interface AcsFieldOverrides {
  /** Keyed by `normalizeOptionGroupName(name)`. An absent key falls back to the built-in match. */
  optionRoles: Record<string, VariantRole>;
}

export const EMPTY_FIELD_OVERRIDES: AcsFieldOverrides = { optionRoles: {} };

/**
 * Parses an untrusted `acs_field_overrides` jsonb value (or a request body) into a valid
 * `AcsFieldOverrides`, dropping anything malformed rather than throwing — a bad key in a request
 * body should never be able to break indexing for an otherwise-valid save.
 */
export function parseFieldOverrides(value: unknown): AcsFieldOverrides {
  if (!value || typeof value !== "object") return { optionRoles: {} };

  const record = value as Record<string, unknown>;
  const optionRoles: Record<string, VariantRole> = {};

  if (record.optionRoles && typeof record.optionRoles === "object") {
    for (const [key, role] of Object.entries(record.optionRoles as Record<string, unknown>)) {
      const normalized = normalizeOptionGroupName(key);
      if (normalized && isVariantRole(role)) optionRoles[normalized] = role;
    }
  }

  return { optionRoles };
}

export function fieldOverridesAreEmpty(overrides: AcsFieldOverrides): boolean {
  return Object.keys(overrides.optionRoles).length === 0;
}
