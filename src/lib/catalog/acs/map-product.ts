import type { CategoryPath } from "@/lib/retrieval/content-hash";
import type { RawCatalogProduct } from "@/lib/catalog/sync-types";
import {
  CUSTOM_OPTION_ATTRIBUTE_PREFIX,
  normalizeOptionGroupName,
  sanitizeAttributeKeySegment,
} from "@/lib/catalog/option-groups";
import {
  claimedColumns,
  columnKey,
  EMPTY_ACS_MAPPING,
  isRoleTarget,
  resolveRole,
  type AcsFieldMapping,
  type CmsColumnRef,
  type CustomAttributeDef,
} from "@/lib/catalog/acs-mapping";
import { ACS_TARGETS } from "@/lib/catalog/acs-targets";
import { SOURCE_FIELDS } from "@/lib/catalog/source-fields";
import { variantFieldDef } from "@/lib/catalog/cms-columns";
import { buildAcsProductId, merchantAttributeValue, MERCHANT_ID_ATTRIBUTE } from "./isolation";
import type { AcsAvailability, AcsCustomAttribute, AcsProduct } from "./types";

/**
 * Bump whenever this function's output shape changes in a way that should force merchants to
 * re-see and re-approve the mapping preview (see the mapping-preview-approval gate) — a new
 * field, a changed flattening rule, a renamed attribute. Purely additive, backward-compatible
 * changes don't strictly need a bump, but when in doubt, bump it: the cost of an unnecessary
 * re-approval is one click, the cost of a silent mapping change nobody saw is a support ticket.
 *
 * 4: option-group roles became merchant-overridable, so the same product can now map differently
 * per store. Every existing approval is invalidated by this bump, which is intended — the mapping a
 * merchant approved under 3 was a global one they had no say in.
 *
 * 6: added the `sizeChartData` source field / `attributes.size_chart_data` destination. Additive
 * and inert everywhere no adapter fills `RawCatalogProduct.sizeChartData` in yet, but a new field
 * still gets a bump per the "when in doubt" rule above.
 *
 * 7: Stage 1 inverted. The mapping is now keyed by ACS field rather than by store field, a bound
 * column feeds only where it is bound, and declared custom attributes can be typed. Merchants who
 * had saved retargets get them converted (`convertLegacyOverrides`) and must re-approve, which this
 * bump is what forces.
 *
 * 8: real ACS `VARIANT` records. `rawCatalogProductToAcsProducts` now emits one tenant-scoped
 * `PRIMARY` (unchanged from version 7's own output) plus one tenant-scoped `VARIANT` per real
 * SKU in `RawCatalogProduct.variants`, each carrying its own price/availability/sku/gtin/image
 * and `primaryProductId`. Every existing approval predates real per-SKU records entirely, so this
 * bump reopens Stage 1 the same way every prior structural change has.
 */
export const MAPPER_VERSION = 8;

export interface MapProductInput {
  raw: RawCatalogProduct;
  connectionId: string;
  /** Every selected category this product belongs to, root-first per path — see
   *  `resolveCategoryPaths` in index-product.ts, unchanged by this migration. */
  categoryPaths: CategoryPath[];
  /** Internal try-on/bundle slot, title-derived — see `resolveGarmentCategory`, unchanged. */
  garmentCategory: string | null;
  garmentSubcategory: string | null;
  /** Internal source membership accepted during the cutover but never published to ACS. */
  sourceCategoryIds?: string[];
  /** Which of the merchant's columns feeds each ACS field, from
   *  `store_connections.acs_field_overrides`. Omitted means "nothing bound", which reproduces
   *  auto-mapping and the built-in name match exactly. */
  fieldMapping?: AcsFieldMapping;
}

/**
 * ACS's `categories: ANY(...)` matches by exact string equality against a stored categories
 * entry (confirmed against the official filter-and-order reference: matching
 * `"Pixel > featured accessories"` requires that exact string to be present, not a prefix of it).
 * A filter naming just the root ("Men") or a middle segment therefore only matches if that
 * segment is *also* stored as its own entry — so every ancestor prefix of a path is emitted
 * alongside the full path, not the leaf alone. Deduped across a product's multiple paths, since
 * two paths sharing a root would otherwise store that root twice.
 *
 * A product with no resolved paths (shouldn't happen for anything actually in scope, but
 * defensive) falls back to an empty array — the caller must not import a `PRIMARY` product with
 * zero categories, since ACS throws `INVALID_ARGUMENT` for that combination.
 */
function flattenCategoryPaths(paths: CategoryPath[]): string[] {
  const flattened = new Set<string>();
  for (const path of paths) {
    for (let depth = 1; depth <= path.length; depth++) {
      flattened.add(path.slice(0, depth).join(" > "));
    }
  }
  return [...flattened];
}

function toAvailability(inStock: boolean): AcsAvailability {
  return inStock ? "IN_STOCK" : "OUT_OF_STOCK";
}

/**
 * The attribute keys this pipeline writes itself, as opposed to ones a merchant's own data creates.
 *
 * Used by `sync.ts` to decide which keys need catalog-level registration: everything on a mapped
 * product that is *not* in here belongs to the merchant (an `opt_*` option group or a declared Table 2
 * attribute) and has to be registered before a filter can name it. Excluding by list rather than
 * matching an `opt_` prefix is what keeps a newly declared attribute from silently arriving
 * unfilterable.
 */
export const PIPELINE_ATTRIBUTE_KEYS: ReadonlySet<string> = new Set([
  MERCHANT_ID_ATTRIBUTE,
  "garment_category",
  "garment_subcategory",
  "product_group_id",
  "sku",
  "size_chart_data",
  // Written on every VARIANT record (see `buildVariantAcsProducts`) so `catalog-reads.ts` can find
  // and downgrade a product's variant children by a plain filter without knowing their ids —
  // `primaryProductId` alone is not documented as filterable, where a registered custom attribute
  // is guaranteed to be.
  "primary_external_id",
]);

export interface VariantAttributes {
  colors: string[];
  sizes: string[];
  materials: string[];
  patterns: string[];
  genders: string[];
  ageGroups: string[];
  /** Values from any group the merchant explicitly reassigned to `brand`. Never populated by the
   *  built-in match — brand normally arrives on `RawCatalogProduct.brand`. */
  brands: string[];
  /** Every other option group (fit, style, ...), keyed by its sanitized name — the catch-all this
   *  app has no dedicated ACS field for. One entry per distinct option name, values deduped by
   *  insertion order same as the named buckets. */
  customOptions: Map<string, string[]>;
}

/**
 * Buckets every `variantOptions` group into ACS's higher-signal named fields where one exists
 * (`colorInfo`/`sizes`/`materials`/`patterns`/`genders`/`ageGroups`), matched case-insensitively
 * since merchants and platforms don't agree on capitalization or spacing. Anything left over
 * (fit, style, ...) has no ACS-predefined equivalent, so it falls into `customOptions` instead of
 * being silently dropped — a real gap in how much of a merchant's own catalog data ever reached
 * ACS's ranking/embedding signal.
 *
 * Routing goes through `resolveRole`, so a merchant who bound their "Talla" group to the `sizes` row
 * — or told Stage 1 the group means `size` — gets it in `product.sizes` rather than
 * `attributes.opt_talla`. That matters well beyond tidiness: the size-intelligence pipeline reads
 * `sizes`, so a store whose size group has a name the built-in match doesn't know would otherwise
 * produce no size data at all.
 *
 * Exported because the sizing scan (`lib/sizing/scan.ts`) has to read a product's sizes and
 * audience through exactly the same routing the index will use. Deriving them any other way is how
 * a store gets a chart researched against sizes that never reach ACS.
 */
export function extractVariantAttributes(raw: RawCatalogProduct, mapping: AcsFieldMapping): VariantAttributes {
  const colors: string[] = [];
  const sizes: string[] = [];
  const materials: string[] = [];
  const patterns: string[] = [];
  const genders: string[] = [];
  const ageGroups: string[] = [];
  const brands: string[] = [];
  const customOptions = new Map<string, string[]>();

  // Groups a declared Table 2 attribute already owns. They still resolve to `custom` — that is what
  // being a custom attribute means — but writing them here too would put the same values in both
  // `attributes.opt_fit` and the merchant's own `attributes.fit`.
  const declared = new Set(mapping.customAttributes.map((attribute) => columnKey(attribute.source)));

  for (const [optionName, values] of Object.entries(raw.variantOptions)) {
    const labels = values.map((v) => v.label);
    if (labels.length === 0) continue;

    const group = normalizeOptionGroupName(optionName);

    switch (resolveRole(mapping, group)) {
      case "color":
        colors.push(...labels);
        break;
      case "size":
        sizes.push(...labels);
        break;
      case "material":
        materials.push(...labels);
        break;
      case "pattern":
        patterns.push(...labels);
        break;
      case "gender":
        genders.push(...labels);
        break;
      case "age_group":
        ageGroups.push(...labels);
        break;
      case "brand":
        brands.push(...labels);
        break;
      case "ignore":
        break;
      case "custom": {
        if (declared.has(columnKey({ kind: "option", group }))) break;
        const key = sanitizeAttributeKeySegment(optionName);
        if (!key) break;
        customOptions.set(key, [...(customOptions.get(key) ?? []), ...labels]);
        break;
      }
    }
  }

  return { colors, sizes, materials, patterns, genders, ageGroups, brands, customOptions };
}

/** The subset of {@link VariantAttributes} that makes sense for one single SKU rather than a
 *  whole product's aggregate. No `brands`/`customOptions` bucket: brand reassignment and a
 *  merchant's declared `opt_*` catch-all are both product-level statements of intent, not
 *  something a single variant record has room to restate per SKU. */
interface VariantOptionBuckets {
  colors: string[];
  sizes: string[];
  materials: string[];
  patterns: string[];
  genders: string[];
  ageGroups: string[];
}

/**
 * Buckets one variant's own `selectedOptions` (`{ Color: "Berry", Size: "M" }`) the same way
 * `extractVariantAttributes` buckets a whole product's `variantOptions`, through the identical
 * `resolveRole` routing — so a merchant's role override or Table 1 binding for, say, "Colour"
 * applies identically whether it is read off the `PRIMARY`'s aggregate or one `VARIANT`'s own
 * single value.
 */
function bucketVariantSelectedOptions(
  selectedOptions: Record<string, string>,
  mapping: AcsFieldMapping
): VariantOptionBuckets {
  const buckets: VariantOptionBuckets = { colors: [], sizes: [], materials: [], patterns: [], genders: [], ageGroups: [] };

  for (const [optionName, value] of Object.entries(selectedOptions)) {
    if (!value) continue;
    const group = normalizeOptionGroupName(optionName);

    switch (resolveRole(mapping, group)) {
      case "color":
        buckets.colors.push(value);
        break;
      case "size":
        buckets.sizes.push(value);
        break;
      case "material":
        buckets.materials.push(value);
        break;
      case "pattern":
        buckets.patterns.push(value);
        break;
      case "gender":
        buckets.genders.push(value);
        break;
      case "age_group":
        buckets.ageGroups.push(value);
        break;
      default:
        // brand/custom/ignore: reassigning a group to brand, or declaring it a Table 2 attribute,
        // is product-level merchant intent — restating it per SKU would just repeat the same
        // value on every one of a product's variant records.
        break;
    }
  }

  return buckets;
}

/** A store field's value, in whichever shape its kind implies. */
type SourceValue =
  | { kind: "text"; value: string }
  | { kind: "list"; value: string[] }
  | { kind: "boolean"; value: boolean }
  | { kind: "price"; price: number; currency: string };

/** Reads whichever of the merchant's columns a row is bound to. The table has its own extractors
 *  against the untyped wire shape; both are driven by the same vocabulary. */
function readColumn(raw: RawCatalogProduct, ref: CmsColumnRef): SourceValue | null {
  switch (ref.kind) {
    case "field":
      return readSourceField(raw, ref.key);
    case "option": {
      const labels = optionLabels(raw, ref.group);
      return labels.length > 0 ? { kind: "list", value: labels } : null;
    }
    case "meta": {
      const value = raw.customFields[ref.key];
      return value && value.trim() ? { kind: "text", value } : null;
    }
    case "variantField":
      return aggregateVariantField(raw, ref.key);
    case "variantMeta":
      return aggregateVariantMeta(raw, ref.key);
    case "unmapped":
      return null;
  }
}

/** One native per-variant field, read off `RawCatalogVariant` by key — the switch this app keeps in
 *  step with `cms-columns.ts`'s `VARIANT_FIELD_DEFS` list, per that module's own doc comment. */
function variantScalar(variant: RawCatalogProduct["variants"][number], key: string): string | number | boolean | null {
  switch (key) {
    case "sku":
      return variant.sku;
    case "barcode":
      return variant.barcode;
    case "title":
      return variant.title;
    case "price":
      return variant.price;
    case "compareAtPrice":
      return variant.compareAtPrice;
    case "inStock":
      return variant.inStock;
    case "inventoryQuantity":
      return variant.inventoryQuantity;
    case "imageUrl":
      return variant.imageUrl;
    case "productUrl":
      return variant.productUrl;
    case "weight":
      return variant.weight;
    case "weightUnit":
      return variant.weightUnit;
    default:
      return null;
  }
}

/**
 * A native per-variant field (`{ kind: "variantField" }`), folded onto the whole product by that
 * field's own fixed aggregation — see `CmsColumnAggregation`'s doc comment for why this is never a
 * silent "first variant wins". Unknown keys and a product with no real variant fan-out (`raw.variants`
 * empty, which `buildVariantAcsProducts` treats identically — see its own doc comment) both read as
 * absent rather than throwing, so a stale binding from a future field list never breaks the mapper.
 */
function aggregateVariantField(raw: RawCatalogProduct, key: string): SourceValue | null {
  const def = variantFieldDef(key);
  if (!def || raw.variants.length === 0) return null;

  switch (def.aggregation) {
    case "list": {
      const values = new Set<string>();
      for (const variant of raw.variants) {
        const value = variantScalar(variant, key);
        if (value === null || value === "") continue;
        values.add(String(value));
      }
      return values.size > 0 ? { kind: "list", value: [...values] } : null;
    }
    case "min":
    case "max": {
      let best: number | null = null;
      for (const variant of raw.variants) {
        const value = variantScalar(variant, key);
        if (typeof value !== "number") continue;
        if (best === null || (def.aggregation === "min" ? value < best : value > best)) best = value;
      }
      return best === null ? null : { kind: "text", value: String(best) };
    }
    case "sum": {
      let total = 0;
      let any = false;
      for (const variant of raw.variants) {
        const value = variantScalar(variant, key);
        if (typeof value !== "number") continue;
        total += value;
        any = true;
      }
      return any ? { kind: "text", value: String(total) } : null;
    }
    case "any":
      return { kind: "boolean", value: raw.variants.some((variant) => variantScalar(variant, key) === true) };
  }
}

/** A per-variant custom field (`{ kind: "variantMeta" }`), folded onto the whole product as the
 *  distinct list of every real variant's own value — a WooCommerce variation's own `meta_data` is
 *  the current real-world source (see `RawCatalogVariant.customFields`'s doc comment). */
function aggregateVariantMeta(raw: RawCatalogProduct, key: string): SourceValue | null {
  const values = new Set<string>();
  for (const variant of raw.variants) {
    const value = variant.customFields[key];
    if (value && value.trim()) values.add(value);
  }
  return values.size > 0 ? { kind: "list", value: [...values] } : null;
}

/**
 * One column's value as display text, for Stage 1's Sample column and its presence counts.
 *
 * Exported so the discovery endpoint reads a sample through the mapper's own reader rather than a
 * lookalike. A second extractor is how the table ends up showing a merchant a value that the index
 * never receives, or vice versa — the disagreement Stage 1 exists to rule out.
 */
export function columnSampleText(raw: RawCatalogProduct, ref: CmsColumnRef): string | null {
  const value = readColumn(raw, ref);
  if (!value) return null;
  const values = textValuesFrom(value);
  return values.length > 0 ? values.join(", ") : null;
}

/** One option group's values, matched by normalized name so a store's "Colour" answers a binding
 *  keyed `colour` however it was capitalized when the merchant chose it. */
function optionLabels(raw: RawCatalogProduct, normalizedGroup: string): string[] {
  const labels: string[] = [];
  for (const [optionName, values] of Object.entries(raw.variantOptions)) {
    if (normalizeOptionGroupName(optionName) !== normalizedGroup) continue;
    for (const value of values) labels.push(value.label);
  }
  return labels;
}

/** Reads one store field off a typed raw product. */
function readSourceField(raw: RawCatalogProduct, key: string): SourceValue | null {
  switch (key) {
    case "title":
      return raw.title ? { kind: "text", value: raw.title } : null;
    case "description":
      return raw.description ? { kind: "text", value: raw.description } : null;
    case "brand":
      return raw.brand ? { kind: "text", value: raw.brand } : null;
    case "price":
      return raw.price !== null && raw.currency
        ? { kind: "price", price: raw.price, currency: raw.currency }
        : null;
    case "inStock":
      return { kind: "boolean", value: raw.inStock };
    case "rawCategories":
      return raw.rawCategories.length > 0 ? { kind: "list", value: raw.rawCategories } : null;
    case "images": {
      const images = raw.images.length > 0 ? raw.images : raw.imageUrl ? [raw.imageUrl] : [];
      return images.length > 0 ? { kind: "list", value: images } : null;
    }
    case "productUrl":
      return raw.productUrl ? { kind: "text", value: raw.productUrl } : null;
    case "productGroupId":
      return raw.productGroupId ? { kind: "text", value: raw.productGroupId } : null;
    case "sku":
      return raw.sku ? { kind: "text", value: raw.sku } : null;
    default:
      return null;
  }
}

/** How a value reads once sent somewhere that holds text. */
function textValuesFrom(value: SourceValue): string[] {
  switch (value.kind) {
    case "text":
      return [value.value];
    case "list":
      return value.value;
    case "boolean":
      return [value.value ? "In stock" : "Out of stock"];
    case "price":
      return [`${value.price} ${value.currency}`];
  }
}

/**
 * A number read out of a field that is not already one, for a merchant who keeps their price
 * somewhere we do not read by default. Null when there is no number in it.
 *
 * Handles both separator conventions, because a European storefront writes "1.299,50" for what a
 * US one writes as "1,299.50" — reading the first as 1.299 would price a product at about a
 * thousandth of its value. Whichever separator appears last is the decimal one; a lone separator
 * is decimal only when exactly two digits follow it.
 */
function numberFrom(value: SourceValue): number | null {
  if (value.kind === "boolean") return null;
  const text = value.kind === "list" ? value.value[0] : value.kind === "text" ? value.value : null;
  if (!text) return null;

  const digits = text.replace(/[^0-9.,-]/g, "");
  const lastDot = digits.lastIndexOf(".");
  const lastComma = digits.lastIndexOf(",");

  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    normalized = digits.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    normalized = /,\d{2}$/.test(digits) ? digits.replace(",", ".") : digits.split(",").join("");
  } else {
    normalized = /\.\d{3}$/.test(digits) ? digits.split(".").join("") : digits;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Stock read out of a text field, for stores that keep it as a word rather than a flag. Anything
 *  unrecognized returns null rather than guessing, since guessing wrong hides real stock. */
function booleanFrom(value: SourceValue): boolean | null {
  if (value.kind !== "text" && value.kind !== "list") return null;
  const text = (value.kind === "list" ? value.value[0] : value.value)?.trim().toLowerCase();
  if (!text) return null;
  if (["true", "yes", "y", "1", "in stock", "instock", "available"].includes(text)) return true;
  if (["false", "no", "n", "0", "out of stock", "outofstock", "unavailable", "sold out"].includes(text)) return false;
  return null;
}

/** Everything the merchant's columns resolved to, indexed by ACS field. */
interface RoutedFields {
  text(target: string): string | undefined;
  list(target: string): string[];
  boolean(target: string): boolean | undefined;
  price(): { price: number; currencyCode: string } | undefined;
}

/**
 * Fills every ACS field from whichever column the merchant bound to it, defaults included.
 *
 * Two passes, and the split is the exclusive-binding rule made mechanical. The first fills the rows a
 * merchant has bound; the second fills what is left from auto-mapping, skipping any row that already
 * took a column and any column already spoken for elsewhere. A column therefore arrives in exactly
 * one ACS field: someone who points `brands[0]` at their SKU column is moving it, not copying it,
 * which is the only reading the inverted table can render as one row per field.
 *
 * Order follows `ACS_TARGETS` then `SOURCE_FIELDS`, so the same product and the same mapping always
 * produce the same output — the property the whole mapper is built on.
 */
function routeAcsFields(raw: RawCatalogProduct, mapping: AcsFieldMapping): RoutedFields {
  const texts = new Map<string, string[]>();
  const lists = new Map<string, string[]>();
  const booleans = new Map<string, boolean>();
  let priceInfo: { price: number; currencyCode: string } | undefined;

  function contribute(target: string, value: SourceValue | null): void {
    if (!value) return;

    // The typed destinations first: they hold one specific shape and anything else has to be
    // converted or dropped.
    if (target === "price") {
      const amount = value.kind === "price" ? value.price : numberFrom(value);
      if (amount !== null) {
        priceInfo = { price: amount, currencyCode: value.kind === "price" ? value.currency : (raw.currency ?? "USD") };
      }
      return;
    }

    if (target === "availability") {
      const flag = value.kind === "boolean" ? value.value : booleanFrom(value);
      if (flag !== null) booleans.set(target, flag);
      return;
    }

    // Everything else is text or a list of it, so every kind has a readable rendering. A price sent
    // to a text field arrives as "59.99 USD" rather than vanishing, which is what the merchant who
    // pointed it there was asking for.
    const values = textValuesFrom(value);
    if (values.length === 0) return;

    texts.set(target, [...(texts.get(target) ?? []), ...values]);
    lists.set(target, [...(lists.get(target) ?? []), ...values]);
  }

  for (const target of ACS_TARGETS) {
    // A stored binding for a pipeline-written field is ignored rather than trusted: the UI never
    // offers one, but a hand-written request body could, and `id`/`merchant_id` are ours.
    if (target.internal) continue;
    const ref = mapping.sources[target.key];
    if (!ref) continue;
    // An option group bound to a native attribute row is carried by `extractVariantAttributes`,
    // which resolves the same binding through `resolveRole`. Reading it here as well would append
    // the same labels twice, since the final assembly concatenates both sources.
    if (ref.kind === "option" && isRoleTarget(target.key)) continue;
    contribute(target.key, readColumn(raw, ref));
  }

  const claimed = claimedColumns(mapping);

  for (const field of SOURCE_FIELDS) {
    if (field.internal) continue;
    // Bound to some other row, so it no longer feeds the one auto-mapping chose for it.
    if (claimed.has(columnKey({ kind: "field", key: field.key }))) continue;
    // That row took a column of its own — including a deliberate "send nothing".
    if (mapping.sources[field.defaultTarget] !== undefined) continue;
    contribute(field.defaultTarget, readSourceField(raw, field.key));
  }

  return {
    text: (target) => texts.get(target)?.[0],
    list: (target) => lists.get(target) ?? [],
    boolean: (target) => booleans.get(target),
    price: () => priceInfo,
  };
}

/**
 * One declared Table 2 attribute's value, coerced to the shape the merchant said it holds.
 *
 * Typing is the whole reason these are not just `opt_*` rows: a heel height stored as text sorts
 * "10" before "7.5", so a merchant who says `number` gets `numbers` in ACS and a usable numeric
 * facet. A value that will not convert is dropped rather than sent as text, since a numeric facet
 * containing "one size" is worse than one missing a product.
 */
function customAttributeValue(
  raw: RawCatalogProduct,
  attribute: CustomAttributeDef
): AcsCustomAttribute | null {
  const value = readColumn(raw, attribute.source);
  if (!value) return null;

  if (attribute.type === "number") {
    const number = value.kind === "price" ? value.price : numberFrom(value);
    return number === null ? null : { numbers: [number], searchable: false, indexable: true };
  }

  if (attribute.type === "boolean") {
    const flag = value.kind === "boolean" ? value.value : booleanFrom(value);
    return flag === null ? null : textAttribute(String(flag), { searchable: false, indexable: true });
  }

  const values = textValuesFrom(value);
  return values.length === 0 ? null : textListAttribute(values, { searchable: true, indexable: true });
}

/**
 * `searchable`/`indexable` here are ignored by any catalog in `CATALOG_LEVEL_ATTRIBUTE_CONFIG`
 * mode — the default, and what this app's catalog uses. What actually makes an attribute
 * filterable is catalog-level registration; see `attributes-config.ts`, which must have been run
 * against the catalog or every scoped query fails with `Unsupported field "attributes.<key>"`.
 * Kept set regardless, since they're the operative flags under the older product-level mode and
 * cost nothing to send.
 */
/** ACS caps a `CustomAttribute.text` array at 400 strings, each at most 256 characters — a limit
 *  ordinary bound fields never approach, but a free-text metafield (a product description pasted
 *  into a Table 2 attribute, a WooCommerce global attribute with hundreds of terms fed through
 *  `variantMeta`'s distinct-list aggregation) can. Clamped here, at the one place every text-shaped
 *  attribute funnels through, rather than pushed onto each caller — silently dropping the tail of
 *  an over-long value is what ACS itself would otherwise do by rejecting the whole product. */
const MAX_ATTRIBUTE_TEXT_VALUES = 400;
const MAX_ATTRIBUTE_TEXT_LENGTH = 256;

function clampAttributeText(value: string): string {
  return value.length > MAX_ATTRIBUTE_TEXT_LENGTH ? value.slice(0, MAX_ATTRIBUTE_TEXT_LENGTH) : value;
}

function textAttribute(value: string, opts: { searchable: boolean; indexable: boolean }): AcsCustomAttribute {
  return { text: [clampAttributeText(value)], searchable: opts.searchable, indexable: opts.indexable };
}

function textListAttribute(values: string[], opts: { searchable: boolean; indexable: boolean }): AcsCustomAttribute {
  return {
    text: values.slice(0, MAX_ATTRIBUTE_TEXT_VALUES).map(clampAttributeText),
    searchable: opts.searchable,
    indexable: opts.indexable,
  };
}

/**
 * The single, pure, deterministic mapper from this app's raw sync data to an ACS `Product`.
 * Called on every product, every sync — backfill batches and single-item webhook patches alike
 * — so the two ingestion paths never drift into producing subtly different shapes for the same
 * product. No LLM call, no randomness, no external lookup: same input always produces the same
 * output, matching `mapToCanonical`'s existing design principle in this codebase.
 *
 * `enriched_description` is deliberately not an input — that field was fully removed (see the
 * plan's "Enriched description ownership" resolution), so `description` here is always the
 * merchant's own raw text, unmodified.
 */
export function rawCatalogProductToAcsProduct(input: MapProductInput): AcsProduct {
  const { raw, connectionId, categoryPaths, garmentCategory, garmentSubcategory } = input;
  const mapping = input.fieldMapping ?? EMPTY_ACS_MAPPING;
  const { colors, sizes, materials, patterns, genders, ageGroups, brands, customOptions } =
    extractVariantAttributes(raw, mapping);

  // Which column reaches each ACS field this time round. With nothing bound every field takes its
  // own default column and `routed` reproduces the mapping below exactly, so a store that has never
  // touched Stage 1 cannot be affected by the binding path at all.
  const routed = routeAcsFields(raw, mapping);

  const attributes: Record<string, AcsCustomAttribute> = {
    [MERCHANT_ID_ATTRIBUTE]: textAttribute(merchantAttributeValue(connectionId), {
      searchable: false,
      indexable: true,
    }),
  };
  if (garmentCategory) {
    attributes.garment_category = textAttribute(garmentCategory, { searchable: false, indexable: true });
  }
  if (garmentSubcategory) {
    attributes.garment_subcategory = textAttribute(garmentSubcategory, { searchable: false, indexable: true });
  }
  const productGroupId = routed.text("productGroupId");
  if (productGroupId) {
    // Pass-through only. Real primary/variant restructuring is deferred (see the plan's
    // "Variants" risk) — this preserves the grouping key for a future migration without acting
    // on it now, since every product today is imported as PRIMARY.
    attributes.product_group_id = textAttribute(productGroupId, { searchable: false, indexable: true });
  }
  const sku = routed.text("sku");
  if (sku) {
    // Exact-match/lookup use (support tooling, precise re-identification), not a keyword-search
    // target — `searchable: false` mirrors the other id-like attributes above.
    attributes.sku = textAttribute(sku, { searchable: false, indexable: true });
  }
  const sizeChartData = routed.text("sizeChartData");
  if (sizeChartData) {
    // Whatever column the merchant bound to the size chart row — a metafield holding a chart, most
    // often. Written but not registered as filterable/searchable: it is a payload to read back per
    // product, not something a shopper facets on.
    attributes.size_chart_data = textAttribute(sizeChartData, { searchable: false, indexable: true });
  }
  // Table 2's declared attributes, each carrying whichever column the merchant bound and the shape
  // they said it holds.
  for (const attribute of mapping.customAttributes) {
    const value = customAttributeValue(raw, attribute);
    if (value) attributes[attribute.key] = value;
  }
  // Everything `extractVariantAttributes` couldn't place in a predefined field (fit, style, ...):
  // real shopper-facing values, unlike the bookkeeping attributes above, so these are searchable
  // and registered as dynamically facetable (see `attributes-config.ts`'s
  // `ensureDynamicAttributeRegistered`) rather than treated like an internal id.
  for (const [key, values] of customOptions) {
    attributes[`${CUSTOM_OPTION_ATTRIBUTE_PREFIX}${key}`] = textListAttribute(values, {
      searchable: true,
      indexable: true,
    });
  }

  const product: AcsProduct = {
    id: buildAcsProductId(connectionId, raw.externalId),
    type: "PRIMARY",
    // ACS rejects a product with no title, so this one destination keeps the store's own title as a
    // floor even if the merchant pointed their title field elsewhere. Losing a retarget is
    // recoverable; a whole catalog failing import on a required field is not.
    title: routed.text("title") ?? raw.title,
    categories: flattenCategoryPaths(categoryPaths),
    availability: toAvailability(routed.boolean("availability") ?? raw.inStock),
    attributes,
  };

  const description = routed.text("description");
  if (description) product.description = description;
  // An explicit `brand` role wins over the routed brand field: reassigning a group to brand is
  // deliberate merchant intent, usually because the platform's own brand/vendor field is empty or
  // wrong, so letting the field they were correcting override them would defeat the point.
  const brand = routed.text("brand");
  if (brands.length > 0) product.brands = brands;
  else if (brand) product.brands = [brand];
  const price = routed.price();
  if (price) product.priceInfo = price;
  const images = routed.list("images");
  if (images.length > 0) product.images = images.map((uri) => ({ uri }));
  const uri = routed.text("uri");
  if (uri) product.uri = uri;

  // Variant-option values and any store field routed to the same destination both land here, in
  // that order: an option group is the more specific statement of intent.
  const routedColors = [...colors, ...routed.list("colors")];
  const routedSizes = [...sizes, ...routed.list("sizes")];
  const routedMaterials = [...materials, ...routed.list("materials")];
  const routedPatterns = [...patterns, ...routed.list("patterns")];
  const routedGenders = [...genders, ...routed.list("genders")];
  const routedAgeGroups = [...ageGroups, ...routed.list("ageGroups")];

  if (routedColors.length > 0) product.colorInfo = { colors: routedColors };
  if (routedSizes.length > 0) product.sizes = routedSizes;
  if (routedMaterials.length > 0) product.materials = routedMaterials;
  if (routedPatterns.length > 0) product.patterns = routedPatterns;
  if (routedGenders.length > 0) product.genders = routedGenders;
  if (routedAgeGroups.length > 0) product.ageGroups = routedAgeGroups;

  return product;
}

/**
 * Builds one tenant-scoped ACS `VARIANT` record per real SKU in `raw.variants`, siblings of the
 * `PRIMARY` product `rawCatalogProductToAcsProduct` builds for the same input. Returns `[]` for a
 * product with zero or one variant — see the inline comment below for why a single SKU is not
 * worth a second record.
 *
 * Unlike the `PRIMARY`, a variant's price/availability/sku/gtin/image/selected-options are never
 * routed through the merchant's Stage 1 mapping table — there is no ambiguity about where one
 * specific SKU's own price comes from the way there is for a *product's* headline price, so this
 * reads `RawCatalogVariant` directly rather than through `routeAcsFields`. The `PRIMARY` keeps
 * carrying the aggregate `colorInfo`/`sizes`/... signal every existing consumer (search ranking,
 * the sizing pipeline, the bundle finder) already depends on unchanged; these are additive
 * children that ACS's own variant rollup uses to match and highlight one exact SKU within that
 * aggregate (`matchingVariantFields`/`matchingVariantCount` on a search result), and what a future
 * add-to-cart resolution can key off directly instead of re-deriving a variant id from the store.
 */
export function buildVariantAcsProducts(input: MapProductInput, primary: AcsProduct): AcsProduct[] {
  const { raw, connectionId } = input;
  const mapping = input.fieldMapping ?? EMPTY_ACS_MAPPING;

  // A product with at most one variant carries no per-SKU variation for a second record to add —
  // every consumer already has everything that variant would state, straight off the `PRIMARY`.
  // Writing one anyway would double the shared catalog's document count for products that are the
  // common case on most stores, for zero new signal.
  if (raw.variants.length <= 1) return [];

  return raw.variants.map((variant) => {
    const buckets = bucketVariantSelectedOptions(variant.selectedOptions, mapping);

    const attributes: Record<string, AcsCustomAttribute> = {
      [MERCHANT_ID_ATTRIBUTE]: textAttribute(merchantAttributeValue(connectionId), {
        searchable: false,
        indexable: true,
      }),
      // What lets `catalog-reads.ts` find and downgrade a product's variant children by a plain
      // filter clause when only the parent's externalId is known (a webhook delete, a category
      // deselection) — see `getAcsVariantIds`.
      primary_external_id: textAttribute(raw.externalId, { searchable: false, indexable: true }),
    };
    if (variant.sku) attributes.sku = textAttribute(variant.sku, { searchable: false, indexable: true });

    const product: AcsProduct = {
      id: buildAcsProductId(connectionId, `${raw.externalId}::${variant.externalId}`),
      type: "VARIANT",
      primaryProductId: primary.id,
      // ACS requires every product to have a title; a variant with its own distinct title (most
      // platforms report one — "Berry / M") gets it appended for legibility in any tooling that
      // lists variants standalone, otherwise it just inherits the parent's.
      title: variant.title ? `${primary.title} — ${variant.title}` : primary.title,
      // Variants inherit the parent's resolved category paths rather than re-resolving anything —
      // a SKU cannot belong to a different category than the product it is a SKU of.
      categories: primary.categories,
      availability: toAvailability(variant.inStock),
      attributes,
    };

    if (primary.description) product.description = primary.description;
    if (primary.brands) product.brands = primary.brands;

    const currency = variant.currency ?? primary.priceInfo?.currencyCode;
    if (variant.price !== null && currency) {
      product.priceInfo = {
        price: variant.price,
        currencyCode: currency,
        ...(variant.compareAtPrice !== null ? { originalPrice: variant.compareAtPrice } : {}),
      };
    } else if (primary.priceInfo) {
      product.priceInfo = primary.priceInfo;
    }

    const image = variant.imageUrl ?? primary.images?.[0]?.uri;
    if (image) product.images = [{ uri: image }];

    if (variant.barcode) product.gtin = variant.barcode;
    const uri = variant.productUrl ?? primary.uri;
    if (uri) product.uri = uri;

    if (buckets.colors.length > 0) product.colorInfo = { colors: buckets.colors };
    if (buckets.sizes.length > 0) product.sizes = buckets.sizes;
    if (buckets.materials.length > 0) product.materials = buckets.materials;
    if (buckets.patterns.length > 0) product.patterns = buckets.patterns;
    if (buckets.genders.length > 0) product.genders = buckets.genders;
    if (buckets.ageGroups.length > 0) product.ageGroups = buckets.ageGroups;

    return product;
  });
}

/**
 * `PRIMARY` plus every real `VARIANT` child, ready for one `importProducts` call — what `sync.ts`
 * imports through for both the webhook and backfill paths. `rawCatalogProductToAcsProduct` above
 * stays exported and singular for the mapping-preview surface, which only ever shows one row per
 * sampled product and has no use for its variant children.
 */
export function rawCatalogProductToAcsProducts(input: MapProductInput): AcsProduct[] {
  const primary = rawCatalogProductToAcsProduct(input);
  return [primary, ...buildVariantAcsProducts(input, primary)];
}

// Re-exported so existing importers (attributes-config.ts) keep one import site, even though both
// now live in `@/lib/catalog/option-groups`.
export { CUSTOM_OPTION_ATTRIBUTE_PREFIX, sanitizeAttributeKeySegment };
