/**
 * Platform-declared schema — metafield definitions, WooCommerce global attributes — as
 * `CmsColumnDef`s, independent of anything the 25-product sample happens to contain.
 *
 * This is what answers the plan's "declare metafield definitions... clearly identify fields that
 * cannot be discovered" requirement: a merchant's own "Manage custom data" definitions and
 * store-wide attributes are real schema the moment they're declared, and a definition with zero
 * populated products yet is still worth naming rather than waiting for the sample to catch up.
 *
 * Bounded, non-catalog-scanning reads only — a handful of small paginated requests per connection,
 * safe to run inside the `mapping-options` GET. The full-catalog *coverage* scan (every product and
 * variant, not just 25) is a separate, deliberately background job — see
 * `discoverCatalogColumnCoverage` in `discover-cms-columns.ts` — because that one cannot be bounded
 * the same way.
 */

import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { decodeCredentials } from "@/lib/utils/crypto";
import { getShopifyAccessToken, listShopifyMetafieldDefinitions } from "@/lib/shopify/client";
import { listWooGlobalAttributes, normalizeWordPressUrl } from "@/lib/woocommerce/client";
import { normalizeOptionGroupName } from "./option-groups";
import { SHOPIFY_METAFIELD_PREFIX } from "./acs-mapping";
import type { CmsColumnDef } from "./cms-columns";

/** `metafield.custom.size_chart` reads as `custom.size_chart` — the merchant's own namespace.key,
 *  same convention `customFieldLabel` in the mapping-options route applies to a sampled value.
 *  Kept here too rather than imported from there, since that module is server route code this one
 *  should stay independent of. */
function metafieldLabel(namespace: string, key: string): string {
  return `${namespace}.${key}`;
}

/**
 * Every Shopify metafield definition the merchant has declared, for both owner types, as
 * bindable — or explicitly not-yet-bindable — columns.
 *
 * Product-owned definitions become ordinary `meta` columns: this app already fetches product
 * metafields during discovery (`discoverCustomFields`) and on the indexing path for anything bound
 * (`boundMetafieldKeys`), so a definition here is fully actionable.
 *
 * Variant-owned definitions are declared `discoverable: false`. This app's Shopify adapter does not
 * fetch variant metafields today (`toShopifyCatalogVariant` always writes `customFields: {}}` — see
 * its doc comment in `shopify/client.ts`), so naming one without a way to read its value would be
 * worse than not mentioning it. Declaring it instead of omitting it is what lets a merchant see
 * *why* their variant-level "Fit Note" metafield never shows a sample, rather than concluding this
 * app cannot see any of their metafields at all.
 */
async function shopifyDefinitionColumns(connection: StoreConnectionRow): Promise<CmsColumnDef[]> {
  if (!connection.apiKeyEncrypted) return [];

  const { clientId, clientSecret } = decodeCredentials(connection.apiKeyEncrypted);
  const token = await getShopifyAccessToken(connection.storeUrl, clientId, clientSecret, connection.id);

  const [productDefs, variantDefs] = await Promise.all([
    listShopifyMetafieldDefinitions(connection.storeUrl, token, "PRODUCT"),
    listShopifyMetafieldDefinitions(connection.storeUrl, token, "PRODUCTVARIANT"),
  ]);

  const productColumns: CmsColumnDef[] = productDefs.map((def) => ({
    ref: { kind: "meta", key: `${SHOPIFY_METAFIELD_PREFIX}${def.namespace}.${def.key}` },
    label: metafieldLabel(def.namespace, def.key),
    group: "product_custom",
    scope: "product",
    valueType: "text",
    description: def.description ?? def.name,
  }));

  const variantColumns: CmsColumnDef[] = variantDefs.map((def) => ({
    ref: { kind: "variantMeta", key: `${SHOPIFY_METAFIELD_PREFIX}${def.namespace}.${def.key}` },
    label: metafieldLabel(def.namespace, def.key),
    group: "variant_custom",
    scope: "variant",
    valueType: "text",
    description: def.description ?? def.name,
    discoverable: false,
  }));

  return [...productColumns, ...variantColumns];
}

/**
 * Every attribute WooCommerce declares store-wide (`pa_color`, `pa_size`, a merchant's own
 * `pa_fit`), as `option` columns — the same kind a `variantOptions` group discovered off the
 * sample already uses, so a global attribute with no term used by any of the 25 sampled products
 * still shows up rather than waiting for a lucky sample.
 */
async function wooDefinitionColumns(connection: StoreConnectionRow): Promise<CmsColumnDef[]> {
  if (!connection.apiKeyEncrypted) return [];

  const { wpUsername, wpAppPassword } = decodeCredentials(connection.apiKeyEncrypted);
  const siteUrl = normalizeWordPressUrl(connection.storeUrl);
  const attributes = await listWooGlobalAttributes(siteUrl, wpUsername, wpAppPassword);

  return attributes
    .filter((attribute) => attribute.termCount > 0)
    .map((attribute) => {
      const normalized = normalizeOptionGroupName(attribute.name);
      return {
        ref: { kind: "option" as const, group: normalized },
        label: attribute.name,
        group: "variant_options" as const,
        scope: "variant" as const,
        valueType: "list" as const,
        description: `${attribute.termCount} term${attribute.termCount === 1 ? "" : "s"} in use store-wide.`,
      };
    });
}

/**
 * Platform-declared columns for whichever platform this connection runs, degrading to an empty
 * list on failure rather than blocking Stage 1 — a merchant's metafield definitions failing to
 * load is a reason to fall back to sample-only discovery for this load, not a reason to 500 the
 * whole mapping-options screen they're trying to use to fix something else.
 */
export async function fetchColumnDefinitions(connection: StoreConnectionRow): Promise<CmsColumnDef[]> {
  try {
    if (connection.platform === "shopify") return await shopifyDefinitionColumns(connection);
    if (connection.platform === "wordpress" || connection.platform === "woocommerce") {
      return await wooDefinitionColumns(connection);
    }
  } catch (err) {
    console.error("[cms-column-discovery fetchColumnDefinitions]", connection.id, err);
  }
  return [];
}
