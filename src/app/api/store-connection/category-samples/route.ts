import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { createCatalogPager } from "@/lib/catalog/pager";
import {
  CATEGORY_PREVIEW_PAGE_SIZES,
  DEFAULT_CATEGORY_PREVIEW_PAGE_SIZE,
  readCategoryPreviewPage,
} from "@/lib/catalog/category-preview";
import { extractVariantAttributes, hasProductImage, resolveProductBrand } from "@/lib/catalog/acs/map-product";
import type { CategorySampleProduct } from "@/modules/store/types";

/**
 * Live products of one category, a page at a time, for the preview on the Mapping tab.
 *
 * Read straight from the merchant's store and filled to the requested page size across the platform's
 * own pages, so "100 per page" is 100 products and not whatever one raw page happened to keep after
 * drafts were dropped. Deliberately separate from mapping-preview, which is the one-time approval gate
 * with a mapped ACS payload — this is a read-only display fetch that can run for any category.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) {
      return Response.json({ error: "Store connection not found" }, { status: 404 });
    }

    const params = req.nextUrl.searchParams;
    const categoryId = params.get("categoryId");
    if (!categoryId) {
      return Response.json({ error: "categoryId is required" }, { status: 400 });
    }

    const requestedSize = Number(params.get("pageSize"));
    const pageSize = (CATEGORY_PREVIEW_PAGE_SIZES as readonly number[]).includes(requestedSize)
      ? requestedSize
      : DEFAULT_CATEGORY_PREVIEW_PAGE_SIZE;
    const cursor = params.get("cursor");

    // `onlyCategoryIds` rather than the saved selection: this runs before a category is ever chosen.
    // The pager still expands a WooCommerce parent to its subtree, as counts and indexing do.
    const pager = await createCatalogPager(connection, {
      onlyCategoryIds: [categoryId],
      pageSize,
      skipVariants: true,
    });
    if (!pager) {
      return Response.json({ items: [], nextCursor: null, total: 0, totalExact: true, pageSize });
    }

    // Products without an image are never published, so the preview shows what the agent can sell.
    const { products, nextCursor, hidden } = await readCategoryPreviewPage(pager, {
      pageSize,
      cursor,
      keep: hasProductImage,
    });

    const items: CategorySampleProduct[] = products.map((raw) => ({
      externalId: raw.externalId,
      title: raw.title,
      sku: raw.sku,
      brand: resolveProductBrand(raw, connection.acsFieldMapping),
      imageUrl: raw.imageUrl,
      price: raw.price,
      currency: raw.currency,
      inStock: raw.inStock,
      productUrl: raw.productUrl,
      sizes: [...extractVariantAttributes(raw, connection.acsFieldMapping).sizes],
    }));

    // Counted once, on the first page; the client carries it. A failed count must not fail the page.
    let total: number | null = null;
    let totalExact = false;
    if (!cursor) {
      try {
        const counted = await pager.countProducts();
        total = counted.total;
        totalExact = counted.exact;
      } catch (err) {
        console.error("[store-connection category-samples count]", err);
      }
    }

    return Response.json({ items, nextCursor, total, totalExact, pageSize, hiddenNoImage: hidden });
  } catch (err) {
    console.error("[store-connection category-samples GET]", err);
    return Response.json({ error: "Could not load category samples" }, { status: 500 });
  }
}
