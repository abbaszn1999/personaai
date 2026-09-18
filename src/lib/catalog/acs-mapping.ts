/**
 * Which of a merchant's columns feeds each ACS field — the persisted document behind Setup Stage 1.
 *
 * The direction matters and is the whole point of this module. An earlier version keyed the mapping
 * by the merchant's own fields (`fieldTargets: { sku: "brand" }`, "where does my SKU go?"), which
 * inverted the question the table asks: ACS's schema is Google's and fixed, so the row is the ACS
 * field and the choice is which column arrives there. Keying it the other way meant the UI had to
 * invert on read and re-derive on write, and a target fed by two fields could not be rendered as one
 * row at all.
 *
 * Kept free of Node built-ins and server imports: Stage 1's table is client code and imports this
 * directly, the same constraint `option-groups.ts` and `acs-targets.ts` document. Anything reaching
 * for `crypto` lives in `acs/field-overrides.ts` instead.
 */

import { NOT_SENT, isAcsTargetKey } from "./acs-targets";
import { SOURCE_FIELDS } from "./source-fields";
import {
  detectDefaultVariantRole,
  isVariantRole,
  normalizeOptionGroupName,
  sanitizeAttributeKeySegment,
  type VariantRole,
} from "./option-groups";

/**
 * One of the merchant's columns, in whichever of the three shapes their platform gives us.
 *
 * `unmapped` is a real choice rather than an absence: a merchant switching an ACS field off wants it
 * gone from search, and a stored `unmapped` says so, where a missing key means "use the default".
 */
export type CmsColumnRef =
  /** A `SOURCE_FIELDS` key — a field every synced product has (`title`, `price`, `sku`). */
  | { kind: "field"; key: string }
  /** A `variantOptions` group, keyed by `normalizeOptionGroupName`. */
  | { kind: "option"; group: string }
  /** Per-product custom data: `metafield.NAMESPACE.KEY` (Shopify) or `meta.KEY` (WooCommerce),
   *  matching the keys adapters write into `RawCatalogProduct.customFields`. */
  | { kind: "meta"; key: string }
  /** A native per-variant scalar every `RawCatalogVariant` carries (`sku`, `price`, `inStock`, ...)
   *  — see `cms-columns.ts`'s `VARIANT_FIELD_DEFS`. Read across every real variant and folded onto
   *  the `PRIMARY` by that field's own fixed, named aggregation when bound to a Table 1/Table 2
   *  row; read per-SKU when the mapper builds each `VARIANT` record directly. */
  | { kind: "variantField"; key: string }
  /** Per-variant custom data, keyed like `meta`/`metafield` but read off
   *  `RawCatalogVariant.customFields` instead of the product's own — a WooCommerce variation's own
   *  `meta_data`, most commonly. Folded onto the `PRIMARY` as the distinct list of every variant's
   *  value, same reasoning as `variantField`'s `"list"` aggregation. */
  | { kind: "variantMeta"; key: string }
  | { kind: "unmapped" };

export const UNMAPPED: CmsColumnRef = { kind: "unmapped" };

export const CUSTOM_ATTRIBUTE_TYPES = ["text", "number", "boolean"] as const;
export type CustomAttributeType = (typeof CUSTOM_ATTRIBUTE_TYPES)[number];

export function isCustomAttributeType(value: unknown): value is CustomAttributeType {
  return typeof value === "string" && (CUSTOM_ATTRIBUTE_TYPES as readonly string[]).includes(value);
}

/**
 * A merchant-declared ACS custom attribute — Table 2 of Stage 1.
 *
 * Distinct from the `opt_*` catch-all an unmatched option group falls into automatically: that one is
 * named after the group and always text, where these are declared deliberately, keep their own key,
 * and say what shape the value is so the mapper can coerce rather than stringify.
 */
export interface CustomAttributeDef {
  /** Sanitized slug written as `attributes.<key>`. Stable id for the row; never a display string. */
  key: string;
  /** What the merchant typed, kept for the table — `key` is lossy (see `sanitizeAttributeKeySegment`). */
  name: string;
  type: CustomAttributeType;
  source: CmsColumnRef;
}

/**
 * A connection's Stage 1 mapping. The empty value reproduces the mapper's default output exactly, so
 * every connection has this shape until a merchant changes something.
 *
 * Three parts because a store has three kinds of decision. `sources` binds an ACS field to a column.
 * `customAttributes` declares ACS fields that do not otherwise exist. `optionRoles` still overrides
 * the *default* resolution of the built-in name matching, which is what fills the native attribute
 * rows for a store that has never opened this table.
 */
export interface AcsFieldMapping {
  /**
   * ACS target key to the column feeding it. Records only explicit bindings: an absent key keeps the
   * built-in resolution, which is what makes auto-mapping and a merchant's edits compose — improving
   * detection later still reaches every row they never touched.
   */
  sources: Record<string, CmsColumnRef>;
  customAttributes: CustomAttributeDef[];
  /** Keyed by `normalizeOptionGroupName(name)`. An absent key falls back to the built-in match. */
  optionRoles: Record<string, VariantRole>;
}

export const EMPTY_ACS_MAPPING: AcsFieldMapping = { sources: {}, customAttributes: [], optionRoles: {} };

export function acsMappingIsEmpty(mapping: AcsFieldMapping): boolean {
  return (
    Object.keys(mapping.sources).length === 0 &&
    mapping.customAttributes.length === 0 &&
    Object.keys(mapping.optionRoles).length === 0
  );
}

// ─── Column identity ──────────────────────────────────────────────────────────

/**
 * A ref as one string, for the places that need a column to be a key: dropdown values, the set of
 * already-claimed columns, row identity. Parsed back by `parseColumnKey`, so the two must stay
 * inverse — hence both living here rather than one of them in the UI.
 */
export function columnKey(ref: CmsColumnRef): string {
  switch (ref.kind) {
    case "field":
      return `field:${ref.key}`;
    case "option":
      return `option:${ref.group}`;
    case "meta":
      return `meta:${ref.key}`;
    case "variantField":
      return `variantField:${ref.key}`;
    case "variantMeta":
      return `variantMeta:${ref.key}`;
    case "unmapped":
      return "unmapped";
  }
}

export function parseColumnKey(key: string): CmsColumnRef {
  const separator = key.indexOf(":");
  if (separator === -1) return UNMAPPED;
  const kind = key.slice(0, separator);
  const rest = key.slice(separator + 1);
  if (!rest) return UNMAPPED;
  if (kind === "field") return { kind: "field", key: rest };
  if (kind === "option") return { kind: "option", group: normalizeOptionGroupName(rest) };
  if (kind === "meta") return { kind: "meta", key: rest };
  if (kind === "variantField") return { kind: "variantField", key: rest };
  if (kind === "variantMeta") return { kind: "variantMeta", key: rest };
  return UNMAPPED;
}

export function sameColumn(a: CmsColumnRef, b: CmsColumnRef): boolean {
  return columnKey(a) === columnKey(b);
}

export function isMapped(ref: CmsColumnRef): boolean {
  return ref.kind !== "unmapped";
}

/** Parses one untrusted ref, returning null rather than `unmapped` so a caller can tell a malformed
 *  value from a deliberate "send nothing". */
export function parseColumnRef(value: unknown): CmsColumnRef | null {
  if (typeof value === "string") {
    // Tolerated because the client sends dropdown values, which are already column keys — accepting
    // both shapes keeps the wire format from needing a second encoding step.
    if (value === "unmapped") return UNMAPPED;
    const parsed = parseColumnKey(value);
    return parsed.kind === "unmapped" ? null : parsed;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.kind === "unmapped") return UNMAPPED;
  if (record.kind === "field" && typeof record.key === "string" && record.key) {
    return { kind: "field", key: record.key };
  }
  if (record.kind === "option" && typeof record.group === "string") {
    const group = normalizeOptionGroupName(record.group);
    return group ? { kind: "option", group } : null;
  }
  if (record.kind === "meta" && typeof record.key === "string" && record.key) {
    return { kind: "meta", key: record.key };
  }
  if (record.kind === "variantField" && typeof record.key === "string" && record.key) {
    return { kind: "variantField", key: record.key };
  }
  if (record.kind === "variantMeta" && typeof record.key === "string" && record.key) {
    return { kind: "variantMeta", key: record.key };
  }
  return null;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

/**
 * Where each ACS target's value comes from when the merchant has bound nothing — the inverse of
 * `SourceFieldDef.defaultTarget`.
 *
 * First field wins if two ever default to the same target, which keeps this a function rather than a
 * list: a row shows one current column, and auto-mapping has never pointed two fields at one target.
 */
const DEFAULT_FIELD_BY_TARGET = new Map<string, string>();
for (const field of SOURCE_FIELDS) {
  if (!DEFAULT_FIELD_BY_TARGET.has(field.defaultTarget)) {
    DEFAULT_FIELD_BY_TARGET.set(field.defaultTarget, field.key);
  }
}

/** The store field auto-mapping sends to this ACS target, or null for a target fed by option groups
 *  (`colors`, `sizes`, ...) or written by the pipeline itself. */
export function defaultColumnForTarget(acsKey: string): CmsColumnRef | null {
  const fieldKey = DEFAULT_FIELD_BY_TARGET.get(acsKey);
  return fieldKey ? { kind: "field", key: fieldKey } : null;
}

/** The ACS target a store field fills by default. */
export function defaultTargetForField(fieldKey: string): string | null {
  return SOURCE_FIELDS.find((field) => field.key === fieldKey)?.defaultTarget ?? null;
}

/** Where each option-group role lands in ACS. The bridge between the two vocabularies: roles are how
 *  a group's *meaning* is stored, target keys are how an ACS field is addressed. */
export const TARGET_BY_ROLE: Record<VariantRole, string> = {
  color: "colors",
  size: "sizes",
  material: "materials",
  pattern: "patterns",
  gender: "genders",
  age_group: "ageGroups",
  brand: "brand",
  custom: "custom",
  ignore: NOT_SENT,
};

export const ROLE_BY_TARGET: Record<string, VariantRole> = Object.fromEntries(
  (Object.entries(TARGET_BY_ROLE) as [VariantRole, string][]).map(([role, target]) => [target, role])
);

/** True for an ACS target normally fed by a `variantOptions` group rather than a scalar field, which
 *  is what decides whether a row's default is a static column or a per-store name match. */
export function isRoleTarget(acsKey: string): boolean {
  const role = ROLE_BY_TARGET[acsKey];
  return role !== undefined && role !== "custom" && role !== "ignore";
}

// ─── Binding resolution ───────────────────────────────────────────────────────

/**
 * The columns already spoken for, as `columnKey` strings.
 *
 * A column feeds at most one ACS field. Without that rule the inverted table cannot be honest:
 * binding `brands[0]` to the SKU column while that column also still fills `attributes.sku` shows one
 * value in two rows and gives the merchant no way to express "move it" as opposed to "copy it". So a
 * bound column stops feeding its own default target, and this set is how the mapper knows.
 */
export function claimedColumns(mapping: AcsFieldMapping): Set<string> {
  const claimed = new Set<string>();
  for (const ref of Object.values(mapping.sources)) {
    if (isMapped(ref)) claimed.add(columnKey(ref));
  }
  for (const attribute of mapping.customAttributes) {
    if (isMapped(attribute.source)) claimed.add(columnKey(attribute.source));
  }
  return claimed;
}

/** Prefix of a `customFields` key holding a Shopify metafield. The rest is the `namespace.key`
 *  identifier the Admin API takes. */
export const SHOPIFY_METAFIELD_PREFIX = "metafield.";

/**
 * The Shopify metafield identifiers this mapping actually needs, for the catalog query to name.
 *
 * Derived from the mapping rather than configured separately because that is what keeps the indexing
 * walk's cost proportional to what the merchant uses: an unbound metafield is never fetched, and
 * binding one is the single action that starts paying for it.
 */
export function boundMetafieldKeys(mapping: AcsFieldMapping): string[] {
  const keys = new Set<string>();

  const collect = (ref: CmsColumnRef): void => {
    if (ref.kind !== "meta" || !ref.key.startsWith(SHOPIFY_METAFIELD_PREFIX)) return;
    const identifier = ref.key.slice(SHOPIFY_METAFIELD_PREFIX.length);
    if (identifier) keys.add(identifier);
  };

  for (const ref of Object.values(mapping.sources)) collect(ref);
  for (const attribute of mapping.customAttributes) collect(attribute.source);

  return [...keys];
}

export interface ResolvedBinding {
  ref: CmsColumnRef;
  /** False when this is auto-mapping's choice rather than the merchant's, so the table can say which
   *  rows have been touched and `Reset Defaults` has something to reset. */
  explicit: boolean;
}

/**
 * What feeds one ACS field right now.
 *
 * `optionGroups` is the store's discovered group names, needed only for the native attribute rows:
 * their default is a name match against the merchant's own catalog, so unlike a scalar row it cannot
 * be answered from static data. Omit it and those rows resolve to `unmapped`, which is the correct
 * answer before discovery has run.
 */
export function resolveBinding(
  mapping: AcsFieldMapping,
  acsKey: string,
  optionGroups: readonly string[] = []
): ResolvedBinding {
  const explicit = mapping.sources[acsKey];
  if (explicit) return { ref: explicit, explicit: true };

  const claimed = claimedColumns(mapping);

  const fieldDefault = defaultColumnForTarget(acsKey);
  if (fieldDefault) {
    return { ref: claimed.has(columnKey(fieldDefault)) ? UNMAPPED : fieldDefault, explicit: false };
  }

  const role = ROLE_BY_TARGET[acsKey];
  if (role) {
    for (const group of optionGroups) {
      const normalized = normalizeOptionGroupName(group);
      if (!normalized || resolveRole(mapping, normalized) !== role) continue;
      if (claimed.has(columnKey({ kind: "option", group: normalized }))) continue;
      return { ref: { kind: "option", group: normalized }, explicit: false };
    }
  }

  return { ref: UNMAPPED, explicit: false };
}

/**
 * A group's role under this mapping: the merchant's own binding first, then their `optionRoles`
 * override, then the built-in name match.
 *
 * Binding beats role because it is the more specific statement made in the more specific place —
 * choosing a group in the `materials` row's dropdown is unambiguous, where a role is a claim about
 * what the group *means*. Without this precedence the two controls could contradict each other and
 * the table would have to render one of them being ignored.
 */
export function resolveRole(mapping: AcsFieldMapping, normalizedGroup: string): VariantRole {
  const key = columnKey({ kind: "option", group: normalizedGroup });

  for (const [acsKey, ref] of Object.entries(mapping.sources)) {
    if (columnKey(ref) !== key) continue;
    const role = ROLE_BY_TARGET[acsKey];
    // A group bound to a target with no role of its own (`title`, `uri`) is picked up by the scalar
    // routing in the mapper, so as far as variant extraction goes it lands nowhere.
    return role ?? "ignore";
  }

  for (const attribute of mapping.customAttributes) {
    if (columnKey(attribute.source) === key) return "custom";
  }

  return mapping.optionRoles[normalizedGroup] ?? detectDefaultVariantRole(normalizedGroup);
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parses an untrusted `acs_field_overrides` jsonb value (or a request body) into a valid mapping,
 * dropping anything malformed rather than throwing — a bad key in a request body should never be able
 * to break indexing for an otherwise-valid save.
 *
 * Also accepts the legacy source-keyed shape, since the column holds it for every connection saved
 * before the table was inverted. See `convertLegacyOverrides`.
 */
export function parseAcsMapping(value: unknown): AcsFieldMapping {
  if (!value || typeof value !== "object") return { sources: {}, customAttributes: [], optionRoles: {} };

  const record = value as Record<string, unknown>;
  const optionRoles: Record<string, VariantRole> = {};
  if (record.optionRoles && typeof record.optionRoles === "object") {
    for (const [key, role] of Object.entries(record.optionRoles as Record<string, unknown>)) {
      const normalized = normalizeOptionGroupName(key);
      if (normalized && isVariantRole(role)) optionRoles[normalized] = role;
    }
  }

  if (record.sources === undefined && record.customAttributes === undefined) {
    return convertLegacyOverrides(record, optionRoles);
  }

  const sources: Record<string, CmsColumnRef> = {};
  if (record.sources && typeof record.sources === "object") {
    for (const [acsKey, ref] of Object.entries(record.sources as Record<string, unknown>)) {
      if (acsKey === NOT_SENT || !isAcsTargetKey(acsKey)) continue;
      const parsed = parseColumnRef(ref);
      if (parsed) sources[acsKey] = parsed;
    }
  }

  const customAttributes: CustomAttributeDef[] = [];
  const seen = new Set<string>();
  if (Array.isArray(record.customAttributes)) {
    for (const entry of record.customAttributes) {
      const attribute = parseCustomAttribute(entry);
      if (!attribute || seen.has(attribute.key)) continue;
      seen.add(attribute.key);
      customAttributes.push(attribute);
    }
  }

  return { sources, customAttributes, optionRoles };
}

function parseCustomAttribute(value: unknown): CustomAttributeDef | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  const key = sanitizeAttributeKeySegment(typeof record.key === "string" ? record.key : "");
  if (!key) return null;

  const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : key;
  const type = isCustomAttributeType(record.type) ? record.type : "text";
  const source = parseColumnRef(record.source) ?? UNMAPPED;

  return { key, name, type, source };
}

/**
 * Reads a mapping saved before Stage 1 was inverted.
 *
 * Best-effort by necessity rather than laziness: `fieldTargets` recorded a direction this shape
 * cannot always express. Two fields pointed at one target used to concatenate, and only one of them
 * can be the bound column now, so the last one wins. Every store is re-approving regardless — the
 * `MAPPER_VERSION` bump that came with the inversion reopens the Stage 1 gate — so a merchant sees
 * whatever this produces before it can reach a real index.
 */
function convertLegacyOverrides(
  record: Record<string, unknown>,
  optionRoles: Record<string, VariantRole>
): AcsFieldMapping {
  const sources: Record<string, CmsColumnRef> = {};
  const customAttributes: CustomAttributeDef[] = [];
  const seen = new Set<string>();

  const fieldTargets =
    record.fieldTargets && typeof record.fieldTargets === "object"
      ? Object.entries(record.fieldTargets as Record<string, unknown>)
      : [];

  for (const [fieldKey, target] of fieldTargets) {
    if (!fieldKey || !isAcsTargetKey(target)) continue;

    if (target === NOT_SENT) {
      // "This field goes nowhere" inverts into "the target it would have filled takes nothing", which
      // is only expressible when we know which target that was.
      const vacated = defaultTargetForField(fieldKey);
      if (vacated) sources[vacated] = UNMAPPED;
      continue;
    }

    if (target === "custom") {
      const key = sanitizeAttributeKeySegment(fieldKey);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      customAttributes.push({ key, name: fieldKey, type: "text", source: { kind: "field", key: fieldKey } });
      continue;
    }

    sources[target] = { kind: "field", key: fieldKey };
  }

  // Hand-declared option groups become declared custom attributes, which is what they always were: a
  // row guaranteeing an attribute exists before the discovery sample happens to carry it. Groups the
  // merchant had also given a named role are left alone — that role still routes them, and turning
  // them into a custom attribute would claim the column and silently empty the named field.
  if (record.manualGroups && typeof record.manualGroups === "object") {
    for (const [group, name] of Object.entries(record.manualGroups as Record<string, unknown>)) {
      const normalized = normalizeOptionGroupName(group);
      if (!normalized || typeof name !== "string" || !name.trim()) continue;
      const role = optionRoles[normalized];
      if (role && role !== "custom") continue;
      const key = sanitizeAttributeKeySegment(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      customAttributes.push({ key, name: name.trim(), type: "text", source: { kind: "option", group: normalized } });
    }
  }

  return { sources, customAttributes, optionRoles };
}
