import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { fetchSampleRawProducts } from "@/lib/catalog/acs/preview";
import { expandCategorySelection } from "@/lib/catalog/category-scope";
import type { CategorySampleProduct } from "@/modules/store/types";

const SAMPLE_LIMIT = 5;

/**
 * Live product samples for a single category, shown in the "preview" modal on the Categories
 * tab before the merchant has selected (or saved) anything. Deliberately separate from
 * mapping-preview: that endpoint is a one-time mapper-approval gate with a mapped ACS payload —
 * this is a read-only display fetch that can run for any category at any time.
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

    const categoryId = req.nextUrl.searchParams.get("categoryId");
    if (!categoryId) {
      return Response.json({ error: "categoryId is required" }, { status: 400 });
    }

    // WooCommerce categories nest; previewing a parent should show its whole subtree, matching
    // how counts and indexing already treat parents. Shopify collection ids are already the
    // native, flat unit, so expansion is a no-op there.
    const categoryIds = expandCategorySelection([categoryId], connection.categories);

    // The display shape below never reads `raw.variants` (sizes come from `variantOptions`,
    // which is already on the product listing response) — skipping WooCommerce's per-product
    // variation fetch removes a request this endpoint doesn't need to make at all.
    const rawProducts = await fetchSampleRawProducts(connection, categoryIds, SAMPLE_LIMIT, { skipVariants: true });

    const samples: CategorySampleProduct[] = rawProducts.map((raw) => ({
      externalId: raw.externalId,
      title: raw.title,
      imageUrl: raw.imageUrl,
      price: raw.price,
      currency: raw.currency,
      inStock: raw.inStock,
      productUrl: raw.productUrl,
      sizes: raw.variantOptions["Size"]?.map((option) => option.label) ?? [],
    }));

    return Response.json({ samples });
  } catch (err) {
    console.error("[store-connection category-samples GET]", err);
    return Response.json({ error: "Could not load category samples" }, { status: 500 });
  }
}
