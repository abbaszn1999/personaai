import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import {
  getStoreConnectionByOwner,
  upsertStoreConnection,
  updateStoreConnection,
  deleteStoreConnection,
  type StoreConnectionRow,
  type UpdateStoreConnectionInput,
} from "@/lib/db/store-connections";
import { encodeCredentials, decodeCredentials } from "@/lib/utils/crypto";
import {
  normalizeShopifyDomain,
  verifyShopifyCredentials,
  getShopifyAccessToken,
  getShopifyProductCount,
  getShopifyCollections,
  registerShopifyWebhooks,
  ShopifyApiError,
} from "@/lib/shopify/client";
import {
  normalizeWordPressUrl,
  verifyWordPressCredentials,
  getWordPressProductCount,
  getWordPressCategories,
  registerWooWebhooks,
  WooCommerceApiError,
} from "@/lib/woocommerce/client";
import { purgeConnectionFromQueue } from "@/lib/db/catalog-queue";
import { deleteAllAcsProductsForConnection, pruneOutOfScopeAcsProducts } from "@/lib/catalog/acs/catalog-reads";
import { expandCategorySelection } from "@/lib/catalog/category-scope";
import { parseCategoryParentMap, parseSkuParentOverrides } from "@/lib/catalog/category-parents";
import { DEFAULT_SIZE_TYPE, parseSizeType, parseSizeTypeOverrides } from "@/lib/sizing/size-types";
import { parseMerchantTree } from "@/lib/catalog/merchant-tree";
import { deriveWebhookSecret } from "@/lib/utils/internal-auth";
import { MAPPER_VERSION } from "@/lib/catalog/acs/map-product";
import { hasApprovedCurrentMapping } from "@/lib/catalog/acs/field-overrides";
import { STYLE_GUIDE_MAX_LENGTH, type StorePlatform, type StoreCategory } from "@/modules/store/types";

const VALID_PLATFORMS: StorePlatform[] = ["shopify", "woocommerce", "wordpress", "custom"];

/** Strips control characters other than tab/newline/carriage-return. Length is validated
 *  separately (rejected, not silently truncated) so a merchant knows their guide was cut off
 *  rather than discovering it later missing from the end. */
export function sanitizeStyleGuide(value: string): string {
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}

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
    categorySelectionGranularity: row.categorySelectionGranularity,
    categories: row.categories,
    categoryParentMap: row.categoryParentMap,
    categoryTree: row.categoryTree,
    skuParentOverrides: row.skuParentOverrides,
    storeSizeType: row.storeSizeType,
    storeSizeTypeOverrides: row.storeSizeTypeOverrides,
    productCount: row.productCount,
    syncedAt: row.syncedAt,
    catalogSync: {
      status: row.catalogSyncStatus,
      progress: row.catalogSyncProgress,
      total: row.catalogSyncTotal,
    },
    acsMapping: {
      approved: hasApprovedCurrentMapping(row, MAPPER_VERSION),
      mapperVersion: MAPPER_VERSION,
    },
    styleGuide: row.styleGuide,
  };
}

/**
 * Subscribes to the merchant's product changes so edits reach the index within seconds
 * instead of waiting for the next reconcile pass.
 *
 * Never throws. A store that refuses webhook registration — a permissions gap, a host
 * blocking outbound calls — is still perfectly usable; it just refreshes on the schedule
 * instead of instantly, and failing the whole connection over that would be the wrong trade.
 */
async function registerProductWebhooks(row: StoreConnectionRow): Promise<void> {
  const appUrl = process.env.APP_URL;
  if (!appUrl || !row.apiKeyEncrypted) return;

  try {
    if (row.platform === "shopify") {
      const { clientId, clientSecret } = decodeCredentials(row.apiKeyEncrypted);
      const domain = normalizeShopifyDomain(row.storeUrl);
      const token = await getShopifyAccessToken(domain, clientId, clientSecret, row.id);
      await registerShopifyWebhooks(domain, token, `${appUrl.replace(/\/+$/, "")}/api/webhooks/shopify`);
      return;
    }

    const { wpUsername, wpAppPassword } = decodeCredentials(row.apiKeyEncrypted);
    await registerWooWebhooks(
      normalizeWordPressUrl(row.storeUrl),
      wpUsername,
      wpAppPassword,
      `${appUrl.replace(/\/+$/, "")}/api/webhooks/woocommerce`,
      deriveWebhookSecret(row.id)
    );
  } catch (err) {
    console.error("[store-connection registerProductWebhooks]", row.id, err);
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const row = await getStoreConnectionByOwner(user.id);
    if (!row) {
      return Response.json({
        connection: null,
        selectedCategoryIds: [],
        categories: [],
        categoryParentMap: {},
        categoryTree: [],
        skuParentOverrides: {},
        storeSizeType: DEFAULT_SIZE_TYPE,
        storeSizeTypeOverrides: {},
        productCount: 0,
        syncedAt: null,
        styleGuide: null,
      });
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

    // Deliberately does not start indexing. A merchant's catalog is usually much larger than the
    // part an agent should sell from, and enrichment is billed per product, so connecting a
    // 100,000-product store would spend the cost of the whole catalog before anyone had said
    // which of it matters. Indexing begins when the category selection is saved.
    if (platform === "shopify" || platform === "wordpress" || platform === "woocommerce") {
      await registerProductWebhooks(row);
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
    const patch: UpdateStoreConnectionInput = {};

    // Deferred until after the write, so the prune runs against the selection that was saved.
    let pruneScope: string[] | null = null;

    if (Array.isArray(body.selectedCategoryIds)) {
      const current = await getStoreConnectionByOwner(user.id);
      if (!current) {
        return Response.json({ error: "Store connection not found" }, { status: 404 });
      }

      const next: string[] = [
        ...new Set((body.selectedCategoryIds as unknown[]).filter((id): id is string => typeof id === "string")),
      ];
      const previous = current.selectedCategoryIds;

      patch.selectedCategoryIds = next;
      // The picker writes leaves directly. Stamping it on every save also self-heals any row the
      // one-time migration couldn't reach, rather than leaving it silently mislabelled.
      patch.categorySelectionGranularity = "leaf";

      const removed = previous.filter((id) => !next.includes(id));

      // Only worth a pass when something was actually dropped. The prune keeps any product another
      // selected category still covers, so this is not the same as deleting the removed categories'
      // products outright.
      if (removed.length > 0 && next.length > 0) {
        pruneScope = expandCategorySelection(next, current.categories);
      }

      // Saving a selection deliberately does *not* start an index any more. Indexing is the last
      // step of the Setup pipeline, which is the only place it can carry sizing attributes and the
      // only place the merchant has approved the mapping it would run under. Two entry points meant
      // a merchant could index from here, skip Setup, and end up with a catalog ACS could search but
      // Persona could not size.
    }

    // Categories step 2. Both are whole-document saves rather than diffs: the merchant edits them
    // as one screen and there is no partial state worth expressing.
    if (body.categoryParentMap !== undefined) {
      patch.categoryParentMap = parseCategoryParentMap(body.categoryParentMap);
    }

    if (body.categoryTree !== undefined) {
      patch.categoryTree = parseMerchantTree(body.categoryTree);
    }

    // Stage 2 corrections. Also a whole-document save: the client holds every override it knows
    // about, and sending the full object is what makes clearing one expressible at all.
    if (body.skuParentOverrides !== undefined) {
      patch.skuParentOverrides = parseSkuParentOverrides(body.skuParentOverrides);
    }

    // Doc Part 2. Independent of each other — a merchant can change the store default without
    // touching their exceptions, and vice versa — so neither is implied by the other's presence.
    if (body.storeSizeType !== undefined) {
      patch.storeSizeType = parseSizeType(body.storeSizeType);
    }

    if (body.storeSizeTypeOverrides !== undefined) {
      patch.storeSizeTypeOverrides = parseSizeTypeOverrides(body.storeSizeTypeOverrides);
    }

    if (body.styleGuide !== undefined) {
      if (body.styleGuide !== null && typeof body.styleGuide !== "string") {
        return Response.json({ error: "styleGuide must be a string or null" }, { status: 400 });
      }
      if (body.styleGuide === null) {
        patch.styleGuide = null;
      } else {
        const sanitized = sanitizeStyleGuide(body.styleGuide);
        if (sanitized.length > STYLE_GUIDE_MAX_LENGTH) {
          return Response.json(
            { error: `Style guide must be ${STYLE_GUIDE_MAX_LENGTH} characters or fewer` },
            { status: 400 }
          );
        }
        // An empty/whitespace-only guide after sanitizing is functionally "cleared" —
        // stored as null rather than "" to match the DB column's existing null-as-unset convention.
        patch.styleGuide = sanitized.length > 0 ? sanitized : null;
      }
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

    // A manual re-index queues the walk again rather than running it here, for the same
    // reason connect does — and only from a settled state, so it can't interrupt a run.
    if (body.reindex === true) {
      const current = await getStoreConnectionByOwner(user.id);
      if (!current) {
        return Response.json({ error: "Store connection not found" }, { status: 404 });
      }
      if (current.catalogSyncStatus === "pending" || current.catalogSyncStatus === "indexing") {
        return Response.json({ error: "This catalog is already being indexed." }, { status: 409 });
      }
      if (current.selectedCategoryIds.length === 0) {
        return Response.json(
          { error: "Choose at least one category before indexing." },
          { status: 400 }
        );
      }
      if (!hasApprovedCurrentMapping(current, MAPPER_VERSION)) {
        return Response.json(
          {
            error: "Review and approve your field mapping in Setup — Stage 1 before indexing can start.",
            code: "mapping_approval_required",
          },
          { status: 409 }
        );
      }
      patch.catalogSyncStatus = "pending";
      patch.catalogSyncProgress = 0;
      patch.catalogSyncTotal = 0;
      // Cleared so a manual re-index covers the whole selection rather than just whatever
      // increment happened to be queued.
      patch.catalogPendingCategoryIds = [];
    }

    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const row = await updateStoreConnection(user.id, patch);

    if (!row) {
      return Response.json({ error: "Store connection not found or update failed" }, { status: 404 });
    }

    // After the write so the new selection is what gets enforced, and after the response shape is
    // settled so a prune failure can't cost the merchant their saved selection.
    if (pruneScope) {
      const removedProducts = await pruneOutOfScopeAcsProducts(row.id, pruneScope);
      if (removedProducts > 0) {
        console.log(`[store-connection PATCH] pruned ${removedProducts} product(s) outside the selection for ${row.id}`);
      }
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

    // ACS has no foreign key back to this table. Stop new writes first, then clean the external
    // catalog while the connection id is still durable enough for a failed request to retry.
    const existing = await getStoreConnectionByOwner(user.id);

    if (existing) {
      const stopped = await updateStoreConnection(user.id, { status: "disconnected" });
      if (!stopped) {
        return Response.json({ error: "Failed to stop catalog synchronization" }, { status: 500 });
      }

      try {
        const purged = await purgeConnectionFromQueue(existing.id);
        if (purged > 0) {
          console.log(`[store-connection DELETE] purged ${purged} queued message(s) for ${existing.id}`);
        }

        const deleted = await deleteAllAcsProductsForConnection(existing.id);
        if (deleted > 0) {
          console.log(`[store-connection DELETE] deleted ${deleted} ACS product(s) for ${existing.id}`);
        }
      } catch (err) {
        console.error("[store-connection DELETE cleanup]", existing.id, err);
        await updateStoreConnection(user.id, { status: "connected" });
        return Response.json(
          { error: "Could not remove the store catalog from ACS. Please try again." },
          { status: 502 }
        );
      }
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
