import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { decodeCredentials } from "@/lib/utils/crypto";
import { normalizeWordPressUrl, listWooCatalogPage } from "@/lib/woocommerce/client";
import { getShopifyAccessToken, listShopifyCatalogPage } from "@/lib/shopify/client";
import type { RawCatalogProduct } from "@/lib/catalog/sync-types";
import { resolveCategoryPaths, resolveGarmentCategory } from "@/lib/catalog/index-product";
import { rawCatalogProductToAcsProduct, type MapProductInput } from "./map-product";
import type { AcsProduct } from "./types";

const PREVIEW_SAMPLE_SIZE = 5;

export interface MappingPreviewSample {
  raw: RawCatalogProduct;
  mapped: AcsProduct;
}

/** Pulls a small real sample from the merchant's own store — never synthetic data — so the
 *  preview shows exactly what the first backfill would actually send. Scoped to `categoryIds`
 *  when given (the selection the merchant is about to save); falls back to the store's default
 *  listing order when there's no selection yet to scope to. */
async function fetchSampleRawProducts(
  connection: StoreConnectionRow,
  categoryIds: string[]
): Promise<RawCatalogProduct[]> {
  if (!connection.apiKeyEncrypted) return [];

  if (connection.platform === "shopify") {
    const { clientId, clientSecret } = decodeCredentials(connection.apiKeyEncrypted);
    const token = await getShopifyAccessToken(connection.storeUrl, clientId, clientSecret, connection.id);
    const { products } = await listShopifyCatalogPage(connection.storeUrl, token, {
      pageSize: PREVIEW_SAMPLE_SIZE,
      categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
    });
    return products.slice(0, PREVIEW_SAMPLE_SIZE);
  }

  if (connection.platform === "wordpress" || connection.platform === "woocommerce") {
    const { wpUsername, wpAppPassword } = decodeCredentials(connection.apiKeyEncrypted);
    const siteUrl = normalizeWordPressUrl(connection.storeUrl);
    const { products } = await listWooCatalogPage(siteUrl, wpUsername, wpAppPassword, {
      pageSize: PREVIEW_SAMPLE_SIZE,
      page: 1,
      categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
    });
    return products.slice(0, PREVIEW_SAMPLE_SIZE);
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
): Promise<MappingPreviewSample[]> {
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
    };

    return { raw, mapped: rawCatalogProductToAcsProduct(input) };
  });
}
