import { getAcsAccessToken } from "./auth";
import { catalogPath, getAcsConfig, isAcsConfigured } from "./config";
import { MERCHANT_ID_ATTRIBUTE } from "./isolation";

/**
 * Registers the custom attributes this app filters on against the catalog's `attributesConfig`.
 *
 * Required because a catalog in `CATALOG_LEVEL_ATTRIBUTE_CONFIG` mode — the default for catalogs
 * created by the current console flow — *ignores* the per-product `indexable`/`searchable` flags
 * that `map-product.ts` sets, and rejects any filter naming an attribute it doesn't already know
 * with `Unsupported field "attributes.<key>" on ":" operator`. Since `merchant_id` is the whole
 * tenant-isolation boundary, an unregistered catalog can't serve a correctly-scoped query.
 *
 * Idempotent, so it is safe to re-run against a catalog that is already fully or partly set up:
 * `addCatalogAttribute` 409s on a key that already exists, which is treated as success.
 */

/** `TEXTUAL` for all five: every one holds ids/labels matched by exact equality via `ANY(...)`,
 *  never compared numerically. */
interface RequiredAttribute {
  /** The bare attribute name as `map-product.ts` writes it into `Product.attributes`. */
  name: string;
  /** Why this app filters on it, for whoever reads the bootstrap output. */
  purpose: string;
}

const REQUIRED_ATTRIBUTES: RequiredAttribute[] = [
  { name: MERCHANT_ID_ATTRIBUTE, purpose: "tenant isolation (merchantFilterClause)" },
  { name: "garment_category", purpose: "garment-slot filters (filter-expression.ts)" },
  { name: "garment_subcategory", purpose: "garment-slot filters (filter-expression.ts)" },
  { name: "product_group_id", purpose: "variant lookups (getProductGroup)" },
  { name: "sku", purpose: "exact-match product lookups (support tooling)" },
  { name: "primary_external_id", purpose: "finding a product's VARIANT children (getAcsVariantIds)" },
];

/**
 * Custom attributes are registered under an `attributes.`-prefixed key, and filtered on by that
 * same prefixed path. Without the prefix the API reads the key as one of its ~35 *predefined*
 * attributes (`title`, `brands`, ...) and rejects anything not on that list.
 */
function catalogAttributeKey(name: string): string {
  return `attributes.${name}`;
}

/**
 * Predefined ("system") attributes this app reads back off search results via `toCandidate`.
 * Every one of them defaults to `RETRIEVABLE_DISABLED` in `CATALOG_LEVEL_ATTRIBUTE_CONFIG` mode —
 * the docs are explicit that "if unset, the server behavior defaults to RETRIEVABLE_DISABLED" —
 * so without this, `SearchResult.product` comes back with only `product.name` populated and every
 * field `toCandidate` reads (`title`, `brands`, `categories`, `priceInfo`, `availability`, `uri`,
 * `images`) is silently `undefined`. `id` is deliberately not in this list: `SearchResult.id` (the
 * top-level field, not `product.id`) is the one field the API guarantees regardless of
 * retrievability, so `toCandidate` reads the id from there instead.
 *
 * `materials`/`patterns`/`genders`/`ageGroups`/`colorFamilies`/`colors`/`sizes` are here for the
 * same reason — every field `map-product.ts` can set on an `AcsProduct` (see
 * `rawCatalogProductToAcsProduct`) belongs in this list, not just the ones something already
 * reads back, so a store's data isn't silently unrecoverable the day something *does* start
 * reading a field that was never fixed up.
 * `description` is the one exception worth calling out: it comes back as free text rather than a
 * variant bucket, but `toCandidate` reads it the same way — off `product.description` — so it
 * needs the same retrievability fix.
 *
 * `colorInfo` — the field name `toCandidate` actually reads off the product (`AcsProduct.colorInfo`)
 * — is deliberately NOT one of these keys: `attributesConfig` has no such attribute and
 * `replaceCatalogAttribute` 404s on it ("Catalog attribute \"colorInfo\" does not exist"). The
 * two attributes that control retrievability of its contents are its own sub-fields,
 * `colorFamilies` and `colors` (see `ColorInfo.color_families`/`ColorInfo.colors` in the API
 * reference) — both are here instead. Getting this wrong is exactly how this quietly no-opped: a
 * `replaceCatalogAttribute("colorInfo")` call threw a 404 that aborted every key after it in the
 * (previously single) sequential loop, so `sizes`/`materials`/`patterns`/`genders`/`ageGroups`
 * silently never got enabled either even though a bootstrap run "succeeded" up to that point.
 */
const PREDEFINED_RETRIEVABLE_KEYS = [
  "title",
  "categories",
  "brands",
  "price",
  "currencyCode",
  "availability",
  "uri",
  "images",
  "description",
  "colorFamilies",
  "colors",
  "sizes",
  "materials",
  "patterns",
  "genders",
  "ageGroups",
];

export interface AttributeRegistrationResult {
  key: string;
  status: "created" | "configuration-refreshed" | "retrievable-enabled";
}

/**
 * `SEARCHABLE_DISABLED` throughout: these are machine ids, and making them searchable would let a
 * shopper's free-text query match against a connection uuid. `DYNAMIC_FACETABLE_DISABLED` for the
 * same reason — none of them is a facet a shopper should ever see.
 */
function attributeBody(key: string) {
  return {
    catalogAttribute: {
      key,
      type: "TEXTUAL",
      indexableOption: "INDEXABLE_ENABLED",
      searchableOption: "SEARCHABLE_DISABLED",
      dynamicFacetableOption: "DYNAMIC_FACETABLE_DISABLED",
      retrievableOption: "RETRIEVABLE_ENABLED",
    },
  };
}

export async function ensureAcsCatalogAttributes(): Promise<AttributeRegistrationResult[]> {
  if (!isAcsConfigured()) {
    throw new Error("[acs/attributes-config] ACS is not configured — set ACS_PROJECT_ID and credentials first");
  }

  const token = await getAcsAccessToken();
  const url = `https://retail.googleapis.com/v2/${catalogPath(getAcsConfig())}/attributesConfig:addCatalogAttribute`;
  const results: AttributeRegistrationResult[] = [];

  // Sequential, not parallel: each call read-modify-writes the one shared `attributesConfig`
  // resource, so concurrent adds can drop each other's writes.
  for (const attribute of REQUIRED_ATTRIBUTES) {
    const key = catalogAttributeKey(attribute.name);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(attributeBody(key)),
    });

    if (res.ok) {
      results.push({ key, status: "created" });
      continue;
    }

    const body = await res.text();
    if (res.status === 409 || body.includes("already exists")) {
      const replaceRes = await fetch(
        `https://retail.googleapis.com/v2/${catalogPath(getAcsConfig())}/attributesConfig:replaceCatalogAttribute`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            ...attributeBody(key),
            updateMask: "indexableOption,searchableOption,dynamicFacetableOption,retrievableOption",
          }),
        },
      );
      if (!replaceRes.ok) {
        throw new Error(
          `[acs/attributes-config] failed to refresh "${key}" (${replaceRes.status}): ${await replaceRes.text()}`,
        );
      }
      results.push({ key, status: "configuration-refreshed" });
      continue;
    }

    throw new Error(`[acs/attributes-config] failed to register "${key}" (${res.status}): ${body}`);
  }

  // Predefined attributes already exist in every catalog's `attributesConfig` (they're not
  // "added", just configured), so this uses `replaceCatalogAttribute` with a mask scoped to
  // `retrievableOption` alone — leaving each attribute's existing `type`/`indexableOption`/
  // `searchableOption` untouched, since sending the full object with those fields' defaults would
  // clobber whatever the console's catalog-creation flow set them to.
  //
  // Independent per key, deliberately not short-circuited on the first failure the way
  // `REQUIRED_ATTRIBUTES` above is: a key list here is the app's own guess at every valid
  // predefined attribute name, and one wrong guess (as `colorInfo` — not itself a real
  // attributesConfig key, see the comment above `PREDEFINED_RETRIEVABLE_KEYS`) previously threw
  // and aborted the loop, leaving every key after it in the array silently never enabled even
  // though the run reported success up to that point.
  const replaceUrl = `https://retail.googleapis.com/v2/${catalogPath(getAcsConfig())}/attributesConfig:replaceCatalogAttribute`;
  const failures: string[] = [];
  for (const key of PREDEFINED_RETRIEVABLE_KEYS) {
    const res = await fetch(replaceUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        catalogAttribute: { key, retrievableOption: "RETRIEVABLE_ENABLED" },
        updateMask: "retrievableOption",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[acs/attributes-config] failed to enable retrievability on "${key}" (${res.status}): ${body}`);
      failures.push(key);
      continue;
    }

    results.push({ key, status: "retrievable-enabled" });
  }

  if (failures.length > 0) {
    throw new Error(
      `[acs/attributes-config] retrievability failed for: ${failures.join(", ")} — every other key still ` +
        "succeeded (see logs above for each one's error); fix the key name(s) and re-run."
    );
  }

  return results;
}

/**
 * Registered keys this process has already confirmed present, so a merchant with a hundred
 * products all carrying the same `opt_fit` attribute only ever triggers one network round-trip
 * for it — cleared on cold start, which just means a fresh process re-confirms once more, no
 * different from every other idempotent call in this module.
 */
const registeredDynamicAttributeKeys = new Set<string>();

/**
 * Unlike `REQUIRED_ATTRIBUTES`, the merchant-specific custom attributes `map-product.ts` emits
 * aren't known ahead of time — the catch-all `opt_<name>` keys for option groups it has no
 * predefined ACS field for (fit, style, ...), and the attributes a merchant declares by hand in
 * Stage 1's Table 2. This registers one on first sight rather than requiring a fixed enumerated
 * list, so a brand-new attribute still becomes filterable/facetable without a manual bootstrap step.
 *
 * `searchable`/`dynamicFacetable` enabled here, unlike `attributeBody`'s machine-id treatment:
 * these carry real shopper-facing values (a fit, a style name) worth matching on free-text query
 * and worth surfacing as a facet, not an internal id to hide.
 *
 * `type` matters rather than being cosmetic: a declared attribute the merchant typed as a number
 * arrives in ACS as `numbers`, and a key registered TEXTUAL against numeric values gives range
 * filters and numeric facets that never match.
 *
 * Best-effort: swallows failures rather than throwing, since this runs inline before every
 * import batch (see `sync.ts`) and a transient registration failure must not block the product
 * write itself — the attribute value still lands on the product either way, just not yet
 * filterable until a later sync's registration attempt succeeds.
 */
export async function ensureDynamicAttributeRegistered(
  attributeName: string,
  type: "TEXTUAL" | "NUMERICAL" = "TEXTUAL"
): Promise<void> {
  const key = catalogAttributeKey(attributeName);
  if (registeredDynamicAttributeKeys.has(key) || !isAcsConfigured()) return;

  try {
    const token = await getAcsAccessToken();
    const url = `https://retail.googleapis.com/v2/${catalogPath(getAcsConfig())}/attributesConfig:addCatalogAttribute`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        catalogAttribute: {
          key,
          type,
          indexableOption: "INDEXABLE_ENABLED",
          // Numeric attributes cannot be free-text searched, and asking for it makes ACS reject the
          // registration outright rather than ignoring the flag.
          searchableOption: type === "NUMERICAL" ? "SEARCHABLE_DISABLED" : "SEARCHABLE_ENABLED",
          dynamicFacetableOption: "DYNAMIC_FACETABLE_ENABLED",
          retrievableOption: "RETRIEVABLE_ENABLED",
        },
      }),
    });

    if (res.ok || res.status === 409) {
      registeredDynamicAttributeKeys.add(key);
      return;
    }

    console.error(`[acs/attributes-config] failed to register dynamic attribute "${key}" (${res.status}): ${await res.text()}`);
  } catch (err) {
    console.error(`[acs/attributes-config] failed to register dynamic attribute "${key}"`, err);
  }
}

export { REQUIRED_ATTRIBUTES, PREDEFINED_RETRIEVABLE_KEYS, catalogAttributeKey };
