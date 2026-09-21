import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner, updateAcsFieldMapping, type StoreConnectionRow } from "@/lib/db/store-connections";
import { fetchSampleRawProducts, fetchStoreBrandNames } from "@/lib/catalog/acs/preview";
import { columnSampleText } from "@/lib/catalog/acs/map-product";
import {
  VARIANT_ROLES,
  normalizeOptionGroupName,
  sanitizeAttributeKeySegment,
  type VariantRole,
} from "@/lib/catalog/option-groups";
import {
  CUSTOM_ATTRIBUTE_TYPES,
  SHOPIFY_METAFIELD_PREFIX,
  columnKey,
  isCustomAttributeType,
  parseColumnKey,
  parseColumnRef,
  type AcsFieldMapping,
  type CmsColumnRef,
  type CustomAttributeDef,
} from "@/lib/catalog/acs-mapping";
import { NOT_SENT, isAcsTargetKey } from "@/lib/catalog/acs-targets";
import { SOURCE_FIELDS } from "@/lib/catalog/source-fields";
import { buildPersonaMappingConfig, personaPathLabel, resolvePersonaPaths } from "@/lib/catalog/persona-mapping";
import {
  classifyDiscoveredColumn,
  cmsColumnGroupOrder,
  nativeVariantFieldColumns,
  sourceFieldColumn,
  type CmsColumnDef,
} from "@/lib/catalog/cms-columns";
import { fetchColumnDefinitions } from "@/lib/catalog/cms-column-discovery";
import { SHOPIFY_NATIVE_COLUMNS } from "@/lib/shopify/product-columns";
import { WOOCOMMERCE_NATIVE_COLUMNS } from "@/lib/woocommerce/product-columns";
import { getPersistedCmsColumns, type PersistedColumnCoverage } from "@/lib/catalog/cms-column-store";
import { toSizingBrands } from "@/lib/sizing/brand-list";
import type { CmsColumn } from "@/modules/store/types";
import type { RawCatalogProduct } from "@/lib/catalog/sync-types";

/** More than the 5-product mapping preview samples — this discovers *every* column a merchant's
 *  catalog offers, and one that only appears on some products (a "Fit" attribute used just for pants,
 *  a size-chart metafield filled in for half the catalog) would be invisible to a merchant looking
 *  for something to bind if the sample were too small. */
const DISCOVERY_SAMPLE_SIZE = 25;

/**
 * Every column of the merchant's own catalog that Stage 1 can bind an ACS field to, discovered from a
 * real sample rather than declared anywhere — the merchant's platform decides what exists.
 *
 * Read-only; never mutates anything.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) {
      return Response.json({ error: "Store connection not found" }, { status: 404 });
    }

    // Independent reads: the sample is a page of products, the brand list and the platform's own
    // declared schema (metafield definitions, global attributes) are separate small reads that
    // don't need the sample to have finished first.
    const [rawProducts, platformBrandNames, definitions, persisted] = await Promise.all([
      fetchSampleRawProducts(connection, connection.selectedCategoryIds, DISCOVERY_SAMPLE_SIZE, {
        discoverCustomFields: true,
      }),
      fetchStoreBrandNames(connection),
      fetchColumnDefinitions(connection),
      // The full-catalog coverage scan's own findings, if a walk has completed one — see
      // `cms-column-store.ts`. Absent (a store that has never run discovery, or one still running
      // it) simply means every column's presence/sample below comes from the 25-product sample
      // alone, exactly as before this feature existed.
      getPersistedCmsColumns(connection.id),
    ]);

    const mapping = connection.acsFieldMapping;
    const columns = discoverColumns(connection, rawProducts, mapping, definitions, persisted);

    // The brands a Part 2 sizing exception can be attached to. Read from the platform rather than
    // counted off the sampled products because the sample is 25 rows: a boutique carrying forty
    // labels would be offered four of them. The sampled brands are unioned in for a store that keeps
    // its brand somewhere the platform does not index.
    const brands = toSizingBrands([...platformBrandNames, ...rawProducts.map((raw) => raw.brand)]);

    return Response.json({
      columns,
      brands,
      mapping,
      sampled: rawProducts.length,
      sizeChart: sizeChartCoverage(rawProducts, mapping),
      // `categories` is the one core row no CMS column actually feeds — see the comment on
      // `categoriesSampleFor` — so its sample can't come from `columnSampleText` like every other
      // row's. Resolved the same way the real index resolves it, on a real sampled product.
      categoriesSample: categoriesSampleFor(connection, rawProducts),
    });
  } catch (err) {
    console.error("[store-connection mapping-options GET]", err);
    return Response.json({ error: "Could not load mapping options" }, { status: 500 });
  }
}

/**
 * Every column Stage 1 can bind an ACS field to: `SOURCE_FIELDS` and each platform's own native
 * registry (always present, whether or not the sample happens to carry a value), every native
 * per-variant field, whatever the platform declares as schema (`definitions` — metafield
 * definitions, WooCommerce global attributes), and finally whatever the 25-product sample
 * discovers live (a merchant's own `variantOptions` group name, an ad hoc metafield/meta key, a
 * per-variant custom field) that none of the above already named.
 *
 * `presence`/`sampled` are carried per column because "exists" and "is filled in" are different
 * answers and only the second one is useful. `persisted`, when a full-catalog coverage scan has
 * completed one, overrides the 25-sample numbers with real ones — see `cms-column-store.ts`.
 *
 * Columns the merchant has already bound are always included, even when nothing in the sample
 * carries them any more: dropping one would silently reset a saved binding to "unmapped" on the
 * next load.
 */
function discoverColumns(
  connection: StoreConnectionRow,
  products: readonly RawCatalogProduct[],
  mapping: AcsFieldMapping,
  definitions: readonly CmsColumnDef[],
  persisted: ReadonlyMap<string, PersistedColumnCoverage>
): CmsColumn[] {
  const columns = new Map<string, CmsColumn>();

  const add = (def: CmsColumnDef): CmsColumn => {
    const key = columnKey(def.ref);
    const existing = columns.get(key);
    if (existing) return existing;
    const column: CmsColumn = {
      key,
      label: def.label,
      group: def.group,
      scope: def.scope,
      valueType: def.valueType,
      description: def.description,
      discoverable: def.discoverable,
      sample: null,
      presence: 0,
      sampled: 0,
    };
    columns.set(key, column);
    return column;
  };

  for (const field of SOURCE_FIELDS) {
    if (field.internal) continue;
    add(sourceFieldColumn(field));
  }

  const nativeRegistry = nativeColumnsFor(connection.platform);
  for (const def of nativeRegistry) add(def);
  for (const def of nativeVariantFieldColumns()) add(def);
  for (const def of definitions) add(def);

  for (const product of products) {
    for (const name of Object.keys(product.variantOptions)) {
      const normalized = normalizeOptionGroupName(name);
      if (!normalized) continue;
      const ref: CmsColumnRef = { kind: "option", group: normalized };
      add({ ref, label: name, ...classifyDiscoveredColumn(ref) });
    }
    for (const key of Object.keys(product.customFields)) {
      const ref: CmsColumnRef = { kind: "meta", key };
      add({ ref, label: customFieldLabel(key), ...classifyDiscoveredColumn(ref) });
    }
    for (const variant of product.variants) {
      for (const key of Object.keys(variant.customFields)) {
        const ref: CmsColumnRef = { kind: "variantMeta", key };
        add({ ref, label: customFieldLabel(key), ...classifyDiscoveredColumn(ref) });
      }
    }
  }

  // Bound columns the sample happened to miss — a group used only by products outside these 25, a
  // metafield the merchant filled in on part of the catalog.
  const bound: CmsColumnRef[] = [...Object.values(mapping.sources), ...mapping.customAttributes.map((a) => a.source)];
  for (const ref of bound) {
    if (ref.kind === "option") add({ ref, label: ref.group, ...classifyDiscoveredColumn(ref) });
    else if (ref.kind === "meta") add({ ref, label: customFieldLabel(ref.key), ...classifyDiscoveredColumn(ref) });
    else if (ref.kind === "variantMeta") add({ ref, label: customFieldLabel(ref.key), ...classifyDiscoveredColumn(ref) });
  }

  for (const product of products) {
    for (const column of columns.values()) {
      const text = columnSampleText(product, parseColumnKey(column.key));
      column.sampled += 1;
      if (!text) continue;
      column.presence += 1;
      column.sample ??= text.length > 160 ? `${text.slice(0, 160)}…` : text;
    }
  }

  // A completed full-catalog scan's own numbers are strictly more informative than a 25-product
  // sample's — replace rather than merge, since the two are not the same denominator.
  for (const column of columns.values()) {
    const coverage = persisted.get(column.key);
    if (!coverage) continue;
    column.presence = coverage.presence;
    column.sampled = coverage.sampled;
    if (coverage.sample) column.sample = coverage.sample;
  }

  return [...columns.values()].sort(
    (a, b) => cmsColumnGroupOrder(a.group) - cmsColumnGroupOrder(b.group) || a.label.localeCompare(b.label)
  );
}

/**
 * A real product's resolved Persona taxonomy path, "Women > Tops" style, for the `categories`
 * row's sample cell.
 *
 * Every other core row's sample comes from `columnSampleText` against whichever CMS column is
 * bound. `categories` has no bound column to read — `map-product.ts` writes it from the same
 * resolution this calls, regardless of anything in `mapping.sources` (see that row's own comment in
 * `acs-rows.ts`) — so its sample has to come from here instead, on a real sampled product, or the
 * row would be the one with no evidence behind it at all.
 *
 * `personaPathLabel` rather than `resolveCategoryPaths`'s own `segments`: those are the stable ids
 * ACS is actually written with (`persona`, `women`, `top`), not something a merchant reads as a
 * path. The first sampled product with any resolved path wins, same reasoning as `columnSampleText`
 * picking the first non-empty value. Null when nothing in the sample maps anywhere, which is honest
 * — a merchant with no Persona category mapping done yet should see that instead of a fabricated
 * path.
 */
function categoriesSampleFor(connection: StoreConnectionRow, products: readonly RawCatalogProduct[]): string | null {
  const config = buildPersonaMappingConfig(connection.personaTaxonomyScope, connection.personaCategoryMap, connection.categories);

  for (const product of products) {
    const [path] = resolvePersonaPaths(product.sourceCategoryIds, config);
    if (path) return personaPathLabel(path, config);
  }
  return null;
}

function nativeColumnsFor(platform: StoreConnectionRow["platform"]): readonly CmsColumnDef[] {
  if (platform === "shopify") return SHOPIFY_NATIVE_COLUMNS;
  if (platform === "wordpress" || platform === "woocommerce") return WOOCOMMERCE_NATIVE_COLUMNS;
  return [];
}

/** `metafield.custom.size_chart` reads as `custom.size_chart`, `meta._fit_note` as `_fit_note`. The
 *  prefix says which platform it came from, which the merchant already knows.
 *
 * `field.stock_quantity` reads as "Stock quantity" instead — unlike a metafield or plugin's own
 * meta key, these are the app's own name for one of the platform's built-in fields (see
 * `toWooBuiltInFields`/`toShopifyBuiltInFields`), so there is no merchant-chosen name to preserve and
 * a prettified label reads better than the raw key. */
function customFieldLabel(key: string): string {
  if (key.startsWith(SHOPIFY_METAFIELD_PREFIX)) return key.slice(SHOPIFY_METAFIELD_PREFIX.length);
  if (key.startsWith("meta.")) return key.slice("meta.".length);
  if (key.startsWith("field.")) {
    const rest = key.slice("field.".length).replace(/_/g, " ");
    return rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return key;
}

/**
 * How much of the sample already carries a size chart, when the merchant has bound a column to that
 * row.
 *
 * This is the number the skip decision rests on: Stages 2 to 5 exist to research and generate charts,
 * and skipping them is only honest if the charts are already there. A merchant who binds a column that
 * turns out to be filled in on three products out of 25 should see that rather than a checkmark.
 */
function sizeChartCoverage(
  products: readonly RawCatalogProduct[],
  mapping: AcsFieldMapping
): { bound: boolean; withData: number; sampled: number } {
  const ref = mapping.sources.sizeChartData;
  if (!ref || ref.kind === "unmapped") return { bound: false, withData: 0, sampled: products.length };

  let withData = 0;
  for (const product of products) {
    if (columnSampleText(product, ref)) withData += 1;
  }

  return { bound: true, withData, sampled: products.length };
}

const VALID_ROLES = new Set<string>(VARIANT_ROLES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates and persists a merchant's Stage 1 mapping. Deliberately does not touch the approval
 * columns — the saved mapping simply stops matching the approved hash, which reopens the Stage 1
 * approval gate before any of this reaches a real index.
 *
 * Each of the three parts is edited by a different control, so an absent key keeps what is already
 * saved rather than clearing it: a body carrying only the part that changed must not wipe the rest.
 * Sending all three empty is therefore what "Reset Defaults" does.
 *
 * Invalid values are rejected rather than dropped, unlike the tolerant parse used on the stored
 * column: a bad binding in a request body is a bug in our own client, and silently discarding it would
 * leave the merchant looking at a choice the server never saved.
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) {
      return Response.json({ error: "Store connection not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!isRecord(body)) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const saved = connection.acsFieldMapping;

    const sources = parseSourcesInput(body.sources, saved);
    if ("error" in sources) return Response.json({ error: sources.error }, { status: 400 });

    const customAttributes = parseCustomAttributesInput(body.customAttributes, saved);
    if ("error" in customAttributes) return Response.json({ error: customAttributes.error }, { status: 400 });

    const optionRoles = parseOptionRolesInput(body.optionRoles, saved);
    if ("error" in optionRoles) return Response.json({ error: optionRoles.error }, { status: 400 });

    const mapping: AcsFieldMapping = {
      sources: sources.value,
      customAttributes: customAttributes.value,
      optionRoles: optionRoles.value,
    };

    const ok = await updateAcsFieldMapping(connection.id, mapping);
    if (!ok) {
      return Response.json({ error: "Failed to save mapping options" }, { status: 500 });
    }

    return Response.json({ mapping });
  } catch (err) {
    console.error("[store-connection mapping-options PATCH]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

type Parsed<T> = { value: T } | { error: string };

function parseSourcesInput(input: unknown, saved: AcsFieldMapping): Parsed<Record<string, CmsColumnRef>> {
  if (input === undefined) return { value: { ...saved.sources } };
  if (!isRecord(input)) return { error: "sources must be an object" };

  const sources: Record<string, CmsColumnRef> = {};
  for (const [acsKey, ref] of Object.entries(input)) {
    // `custom` and `ignore` are role destinations rather than ACS fields a column can be bound to —
    // an attribute a merchant wants by name is a Table 2 row, which travels in `customAttributes`.
    if (!isAcsTargetKey(acsKey) || acsKey === NOT_SENT || acsKey === "custom") {
      return { error: `Unknown ACS field "${acsKey}"` };
    }
    const parsed = parseColumnRef(ref);
    if (!parsed) return { error: `Invalid column for ACS field "${acsKey}"` };
    sources[acsKey] = parsed;
  }

  return { value: sources };
}

/**
 * ACS caps `Product.attributes` at 200 entries. `map-product.ts` writes a handful of those itself
 * regardless of what a merchant declares — `merchant_id`, `garment_category`,
 * `garment_subcategory`, `product_group_id`, `sku`, `size_chart_data`, `primary_external_id` on a
 * `VARIANT` — and an unclassified option group can add one more `opt_*` catch-all per group name.
 * Capped well below 200 rather than exactly at it, so that headroom survives a future pipeline
 * attribute without silently pushing some merchant's declared attributes over the real ACS ceiling.
 */
const MAX_CUSTOM_ATTRIBUTES = 180;

function parseCustomAttributesInput(input: unknown, saved: AcsFieldMapping): Parsed<CustomAttributeDef[]> {
  if (input === undefined) return { value: [...saved.customAttributes] };
  if (!Array.isArray(input)) return { error: "customAttributes must be an array" };

  if (input.length > MAX_CUSTOM_ATTRIBUTES) {
    return {
      error:
        `ACS allows at most 200 custom attributes on a product, and this app reserves some of that ` +
        `for its own bookkeeping fields and your option groups — keep declared custom attributes to ` +
        `${MAX_CUSTOM_ATTRIBUTES} or fewer (you sent ${input.length}).`,
    };
  }

  const attributes: CustomAttributeDef[] = [];
  const seen = new Set<string>();

  for (const entry of input) {
    if (!isRecord(entry)) return { error: "Each custom attribute must be an object" };

    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!name) return { error: "Give every custom attribute a name" };

    // Derived from the name rather than accepted from the client: the key is what ACS is queried by,
    // and letting the two drift means a merchant renaming an attribute silently keeps writing the old
    // ACS field. A name that sanitizes to nothing has no key to write to at all.
    const key = sanitizeAttributeKeySegment(typeof entry.key === "string" && entry.key ? entry.key : name);
    if (!key) return { error: `"${name}" needs at least one letter or number in its name` };
    if (seen.has(key)) return { error: `"${name}" duplicates another custom attribute` };
    seen.add(key);

    if (entry.type !== undefined && !isCustomAttributeType(entry.type)) {
      return { error: `Type must be one of ${CUSTOM_ATTRIBUTE_TYPES.join(", ")}` };
    }

    const source = parseColumnRef(entry.source);
    if (!source) return { error: `Invalid column for custom attribute "${name}"` };

    attributes.push({ key, name, type: isCustomAttributeType(entry.type) ? entry.type : "text", source });
  }

  return { value: attributes };
}

function parseOptionRolesInput(input: unknown, saved: AcsFieldMapping): Parsed<Record<string, VariantRole>> {
  if (input === undefined) return { value: { ...saved.optionRoles } };
  if (!isRecord(input)) return { error: "optionRoles must be an object" };

  const optionRoles: Record<string, VariantRole> = {};
  for (const [key, role] of Object.entries(input)) {
    const normalized = normalizeOptionGroupName(key);
    if (!normalized) continue;
    if (typeof role !== "string" || !VALID_ROLES.has(role)) {
      return { error: `Invalid role "${String(role)}" for option group "${key}"` };
    }
    optionRoles[normalized] = role as VariantRole;
  }

  return { value: optionRoles };
}
