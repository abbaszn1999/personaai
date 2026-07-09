import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import {
  getStoreConnectionByOwner,
  upsertStoreConnection,
  updateStoreConnection,
  deleteStoreConnection,
  type StoreConnectionRow,
} from "@/lib/db/store-connections";
import { encodeCredentials, decodeCredentials } from "@/lib/utils/crypto";
import {
  normalizeShopifyDomain,
  verifyShopifyCredentials,
  getShopifyAccessToken,
  getShopifyProductCount,
  getShopifyCollections,
  ShopifyApiError,
} from "@/lib/shopify/client";
import {
  normalizeWordPressUrl,
  verifyWordPressCredentials,
  getWordPressProductCount,
  getWordPressCategories,
  WooCommerceApiError,
} from "@/lib/woocommerce/client";
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

    const { platform, storeUrl, apiKey, clientId, clientSecret, wpUsername, wpAppPassword } = await req.json();

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
    let apiKeyEncrypted: string | null = null;

    if (platform === "shopify") {
      const trimmedClientId = typeof clientId === "string" ? clientId.trim() : "";
      const trimmedClientSecret = typeof clientSecret === "string" ? clientSecret.trim() : "";
      if (!trimmedClientId || !trimmedClientSecret) {
        return Response.json(
          { error: "Client ID and Client Secret are required for Shopify" },
          { status: 400 }
        );
      }

      const domain = normalizeShopifyDomain(trimmedUrl);
      try {
        const token = await getShopifyAccessToken(domain, trimmedClientId, trimmedClientSecret);
        const shopInfo = await verifyShopifyCredentials(domain, token);
        storeName = shopInfo.name;
        trimmedUrl = shopInfo.domain;
        productCount = await getShopifyProductCount(trimmedUrl, token);
        categories = await getShopifyCollections(trimmedUrl, token);
        apiKeyEncrypted = encodeCredentials({ clientId: trimmedClientId, clientSecret: trimmedClientSecret });
      } catch (err) {
        console.error("[store-connection POST shopify]", err);
        const message =
          err instanceof ShopifyApiError
            ? err.message
            : "Could not connect to Shopify — check your store domain, Client ID, and Client Secret";
        const status = err instanceof ShopifyApiError && err.status === 401 ? 401 : 400;
        return Response.json({ error: message }, { status });
      }
    } else if (platform === "wordpress") {
      const trimmedUsername = typeof wpUsername === "string" ? wpUsername.trim() : "";
      const trimmedAppPassword = typeof wpAppPassword === "string" ? wpAppPassword.trim() : "";
      if (!trimmedUsername || !trimmedAppPassword) {
        return Response.json(
          { error: "WordPress username and Application Password are required" },
          { status: 400 }
        );
      }

      const siteUrl = normalizeWordPressUrl(trimmedUrl);
      try {
        const shopInfo = await verifyWordPressCredentials(siteUrl, trimmedUsername, trimmedAppPassword);
        storeName = shopInfo.name;
        trimmedUrl = siteUrl.replace(/^https?:\/\//, "");
        productCount = await getWordPressProductCount(siteUrl, trimmedUsername, trimmedAppPassword);
        categories = await getWordPressCategories(siteUrl, trimmedUsername, trimmedAppPassword);
        apiKeyEncrypted = encodeCredentials({ wpUsername: trimmedUsername, wpAppPassword: trimmedAppPassword });
      } catch (err) {
        console.error("[store-connection POST wordpress]", err);
        const message =
          err instanceof WooCommerceApiError
            ? err.message
            : "Could not connect to WordPress — check your site URL, username, and Application Password";
        const status = err instanceof WooCommerceApiError && err.status === 401 ? 401 : 400;
        return Response.json({ error: message }, { status });
      }
    } else {
      // No real integration yet for this platform — simulate an initial catalog sync.
      productCount = Math.floor(Math.random() * 300) + 50;
      if (typeof apiKey === "string" && apiKey.trim().length > 0) {
        apiKeyEncrypted = encodeCredentials({ apiKey: apiKey.trim() });
      }
    }

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
          const { clientId, clientSecret } = decodeCredentials(current.apiKeyEncrypted);
          const token = await getShopifyAccessToken(current.storeUrl, clientId, clientSecret);
          patch.productCount = await getShopifyProductCount(current.storeUrl, token);
          patch.categories = await getShopifyCollections(current.storeUrl, token);
          patch.syncedAt = new Date().toISOString();
        } catch (err) {
          console.error("[store-connection PATCH sync shopify]", err);
          const message = err instanceof ShopifyApiError ? err.message : "Failed to sync with Shopify";
          return Response.json({ error: message }, { status: 502 });
        }
      } else if (current.platform === "wordpress" && current.apiKeyEncrypted) {
        try {
          const { wpUsername, wpAppPassword } = decodeCredentials(current.apiKeyEncrypted);
          const siteUrl = normalizeWordPressUrl(current.storeUrl);
          patch.productCount = await getWordPressProductCount(siteUrl, wpUsername, wpAppPassword);
          patch.categories = await getWordPressCategories(siteUrl, wpUsername, wpAppPassword);
          patch.syncedAt = new Date().toISOString();
        } catch (err) {
          console.error("[store-connection PATCH sync wordpress]", err);
          const message = err instanceof WooCommerceApiError ? err.message : "Failed to sync with WordPress";
          return Response.json({ error: message }, { status: 502 });
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
