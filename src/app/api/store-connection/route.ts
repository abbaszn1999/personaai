import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import {
  getStoreConnectionByOwner,
  upsertStoreConnection,
  updateStoreConnection,
  deleteStoreConnection,
  type StoreConnectionRow,
} from "@/lib/db/store-connections";
import { encryptSecret, decryptSecret } from "@/lib/utils/crypto";
import {
  normalizeShopifyDomain,
  verifyShopifyCredentials,
  getShopifyProductCount,
  getShopifyCollections,
  ShopifyApiError,
} from "@/lib/shopify/client";
import type { StorePlatform, StoreCategory } from "@/modules/store/types";

const VALID_PLATFORMS: StorePlatform[] = ["shopify", "woocommerce", "wordpress", "custom"];

/** Never expose the encrypted API key to the client. */
function toPublicConnection(row: StoreConnectionRow) {
  return {
    id: row.id,
    platform: row.platform,
    storeName: row.storeName,
    storeUrl: row.storeUrl,
    status: row.status,
    connectedAt: row.createdAt,
  };
}

function toResponse(row: StoreConnectionRow) {
  return {
    connection: toPublicConnection(row),
    selectedCategoryIds: row.selectedCategoryIds,
    categories: row.categories,
    productCount: row.productCount,
    syncedAt: row.syncedAt,
  };
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const row = await getStoreConnectionByOwner(user.id);
    if (!row) {
      return Response.json({ connection: null, selectedCategoryIds: [], categories: [], productCount: 0, syncedAt: null });
    }

    return Response.json(toResponse(row));
  } catch (err) {
    console.error("[store-connection GET]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { platform, storeUrl, apiKey } = await req.json();

    if (!VALID_PLATFORMS.includes(platform)) {
      return Response.json({ error: "Invalid platform" }, { status: 400 });
    }
    if (typeof storeUrl !== "string" || storeUrl.trim().length < 4) {
      return Response.json({ error: "Please enter a valid store URL" }, { status: 400 });
    }

    let trimmedUrl = storeUrl.trim();
    let storeName = trimmedUrl.split(".")[0] || "My Store";
    let productCount = 0;
    let categories: StoreCategory[] = [];

    if (platform === "shopify") {
      const token = typeof apiKey === "string" ? apiKey.trim() : "";
      if (!token) {
        return Response.json({ error: "An Admin API access token is required for Shopify" }, { status: 400 });
      }

      const domain = normalizeShopifyDomain(trimmedUrl);
      try {
        const shopInfo = await verifyShopifyCredentials(domain, token);
        storeName = shopInfo.name;
        trimmedUrl = shopInfo.domain;
        productCount = await getShopifyProductCount(trimmedUrl, token);
        categories = await getShopifyCollections(trimmedUrl, token);
      } catch (err) {
        console.error("[store-connection POST shopify]", err);
        const status = err instanceof ShopifyApiError && err.status === 401 ? 401 : 400;
        return Response.json(
          { error: "Could not connect to Shopify — check your store URL and access token" },
          { status }
        );
      }
    } else {
      // No real integration yet for this platform — simulate an initial catalog sync.
      productCount = Math.floor(Math.random() * 300) + 50;
    }

    const apiKeyEncrypted =
      typeof apiKey === "string" && apiKey.trim().length > 0 ? encryptSecret(apiKey.trim()) : null;

    const row = await upsertStoreConnection({
      ownerId: user.id,
      platform,
      storeName,
      storeUrl: trimmedUrl,
      apiKeyEncrypted,
      productCount,
      categories,
    });

    if (!row) {
      return Response.json({ error: "Failed to connect store" }, { status: 500 });
    }

    return Response.json(toResponse(row), { status: 201 });
  } catch (err) {
    console.error("[store-connection POST]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const patch: {
      selectedCategoryIds?: string[];
      categories?: StoreCategory[];
      productCount?: number;
      syncedAt?: string | null;
    } = {};

    if (Array.isArray(body.selectedCategoryIds)) {
      patch.selectedCategoryIds = body.selectedCategoryIds;
    }

    if (body.sync === true) {
      const current = await getStoreConnectionByOwner(user.id);
      if (!current) {
        return Response.json({ error: "Store connection not found" }, { status: 404 });
      }

      if (current.platform === "shopify" && current.apiKeyEncrypted) {
        try {
          const token = decryptSecret(current.apiKeyEncrypted);
          patch.productCount = await getShopifyProductCount(current.storeUrl, token);
          patch.categories = await getShopifyCollections(current.storeUrl, token);
          patch.syncedAt = new Date().toISOString();
        } catch (err) {
          console.error("[store-connection PATCH sync shopify]", err);
          return Response.json({ error: "Failed to sync with Shopify" }, { status: 502 });
        }
      } else {
        // Simulated re-sync for platforms without a real integration yet.
        patch.productCount = current.productCount + Math.floor(Math.random() * 5);
        patch.syncedAt = new Date().toISOString();
      }
    }

    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const row = await updateStoreConnection(user.id, patch);

    if (!row) {
      return Response.json({ error: "Store connection not found or update failed" }, { status: 404 });
    }

    return Response.json(toResponse(row));
  } catch (err) {
    console.error("[store-connection PATCH]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ok = await deleteStoreConnection(user.id);
    if (!ok) {
      return Response.json({ error: "Failed to disconnect store" }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("[store-connection DELETE]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
