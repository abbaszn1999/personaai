import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { decodeCredentials } from "@/lib/utils/crypto";
import { normalizeWordPressUrl, listWooCatalogPage, getWordPressBrands } from "@/lib/woocommerce/client";
import { getShopifyAccessToken, listShopifyCatalogPage, getShopifyVendors } from "@/lib/shopify/client";
import type { RawCatalogProduct } from "@/lib/catalog/sync-types";
import { boundMetafieldKeys } from "@/lib/catalog/acs-mapping";
import { resolveCategoryPaths, resolveGarmentCategory } from "@/lib/catalog/index-product";
import { rawCatalogProductToAcsProduct, type MapProductInput } from "./map-product";
import type { AcsProduct } from "./types";

const PREVIEW_SAMPLE_SIZE = 5;

/**
 * Server-side preview row, precisely typed. Reaches the client JSON-serialized as
 * `MappingPreviewSample` (src/modules/store/types.ts), which is deliberately loose — that module is
 * client code and has no business importing the ACS product schema. Named differently rather than
 * declaring `MappingPreviewSample` twice with two different shapes, which is what it used to do.
 */
export interface MappingPreviewRow {
  raw: RawCatalogProduct;
  mapped: AcsProduct;
}

/** Pulls a small real sample from the merchant's own store — never synthetic data — so the
 *  preview shows exactly what the first backfill would actually send. Scoped to `categoryIds`
 *  when given (the selection the merchant is about to save); falls back to the store's default
 *  listing order when there's no selection yet to scope to.
 *
 *  Exported for reuse by the category-samples endpoint (previewing a single category before it's
 *  ever selected), which needs the same live Shopify/Woo listing but a display shape, not a
 *  mapped ACS payload. */
export async function fetchSampleRawProducts(
  connection: StoreConnectionRow,
  categoryIds: string[],
  sampleSize: number = PREVIEW_SAMPLE_SIZE,
  options: { discoverCustomFields?: boolean } = {}
): Promise<RawCatalogProduct[]> {
  if (!connection.apiKeyEncrypted) return [];

  if (connection.platform === "shopify") {
    const { clientId, clientSecret } = decodeCredentials(connection.apiKeyEncrypted);
    const token = await getShopifyAccessToken(connection.storeUrl, clientId, clientSecret, connection.id);
    const { products } = await listShopifyCatalogPage(connection.storeUrl, token, {
      pageSize: sampleSize,
      categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
      // A sample is worth reading metafields for two different reasons. Discovery wants everything
      // there is, so a merchant can see which of their metafields exist before binding one; the
      // mapping preview wants only what is bound, because it has to show exactly what the index will
      // send. Both are one small page, so neither pays the walk's cost.
      metafieldKeys: boundMetafieldKeys(connection.acsFieldMapping),
      discoverCustomFields: options.discoverCustomFields,
    });
    return products.slice(0, sampleSize);
  }

  if (connection.platform === "wordpress" || connection.platform === "woocommerce") {
    const { wpUsername, wpAppPassword } = decodeCredentials(connection.apiKeyEncrypted);
    const siteUrl = normalizeWordPressUrl(connection.storeUrl);
    const { products } = await listWooCatalogPage(siteUrl, wpUsername, wpAppPassword, {
      pageSize: sampleSize,
      page: 1,
      categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
    });
    return products.slice(0, sampleSize);
  }

  return [];
}

/**
 * Every brand the store itself knows about, from whichever index the platform keeps — Woo's
 * `product_brand` terms, Shopify's vendor list.
 *
 * Read from the platform rather than counted off the sampled products because the sample is 25 rows:
 * a boutique carrying forty labels would be offered four of them, which is what this replaced. Both
 * platforms maintain the list already, so it costs one cheap request instead of a catalog walk.
 *
 * Degrades to an empty list on failure. It feeds an optional control, and the caller unions this with
 * the brands read off the sample, so a store whose brand lives somewhere non-standard still gets the
 * brands it can actually see.
 */
export async function fetchStoreBrandNames(connection: StoreConnectionRow): Promise<string[]> {
  if (!connection.apiKeyEncrypted) return [];

  try {
    if (connection.platform === "shopify") {
      const { clientId, clientSecret } = decodeCredentials(connection.apiKeyEncrypted);
      const token = await getShopifyAccessToken(connection.storeUrl, clientId, clientSecret, connection.id);
      return await getShopifyVendors(connection.storeUrl, token);
    }

    if (connection.platform === "wordpress" || connection.platform === "woocommerce") {
      const { wpUsername, wpAppPassword } = decodeCredentials(connection.apiKeyEncrypted);
      return await getWordPressBrands(normalizeWordPressUrl(connection.storeUrl), wpUsername, wpAppPassword);
    }
  } catch (err) {
    console.error("[preview fetchStoreBrandNames]", err);
  }

  return [];
}

/**
 * Builds the merchant-facing mapping preview: real sample products, run through the exact same
 * category resolution and mapper the real backfill will use — not a lookalike or a mock. This is
 * what the merchant approves before the first import ever runs (see the mapping-preview-approval
 * gate).
 */
export async function buildMappingPreview(
  connection: StoreConnectionRow,
  categoryIds: string[]
): Promise<MappingPreviewRow[]> {
  const rawProducts = await fetchSampleRawProducts(connection, categoryIds);

  return rawProducts.map((raw) => {
    const withMembership = { ...raw, sourceCategoryIds: raw.sourceCategoryIds.length > 0 ? raw.sourceCategoryIds : categoryIds };
    const categoryPaths = resolveCategoryPaths(withMembership, connection);
    const { garmentCategory, garmentSubcategory } = resolveGarmentCategory(raw);

    const input: MapProductInput = {
      raw,
      connectionId: connection.id,
      categoryPaths,
      garmentCategory,
      garmentSubcategory,
      sourceCategoryIds: withMembership.sourceCategoryIds,
      // Without this the preview would show the built-in mapping while the index used the
      // merchant's overrides — the exact disagreement this whole surface exists to prevent.
      fieldMapping: connection.acsFieldMapping,
    };

    return { raw, mapped: rawCatalogProductToAcsProduct(input) };
  });
}
