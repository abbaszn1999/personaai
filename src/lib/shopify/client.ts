import type { StoreCategory } from "@/modules/store/types";

const API_VERSION = "2024-10";

export class ShopifyApiError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = "ShopifyApiError";
  }
}

/**
 * Normalizes user input (`mystore`, `mystore.myshopify.com`, `https://mystore.myshopify.com/`)
 * into a bare `mystore.myshopify.com` domain suitable for Admin API calls.
 */
export function normalizeShopifyDomain(input: string): string {
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!domain.includes(".")) {
    domain = `${domain}.myshopify.com`;
  }
  return domain;
}

async function shopifyFetch<T>(domain: string, accessToken: string, path: string): Promise<T> {
  const res = await fetch(`https://${domain}/admin/api/${API_VERSION}${path}`, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new ShopifyApiError(`Shopify API request failed (${res.status})`, res.status);
  }

  return res.json() as Promise<T>;
}

/** Runs `fn` over `items` with at most `limit` calls in flight at once. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export interface ShopifyShopInfo {
  name: string;
  domain: string;
}

/** Confirms the domain + access token are valid by fetching shop info. Throws on failure. */
export async function verifyShopifyCredentials(domain: string, accessToken: string): Promise<ShopifyShopInfo> {
  const data = await shopifyFetch<{ shop: { name: string; myshopify_domain?: string } }>(
    domain,
    accessToken,
    "/shop.json"
  );
  return { name: data.shop.name, domain: data.shop.myshopify_domain ?? domain };
}

export async function getShopifyProductCount(domain: string, accessToken: string): Promise<number> {
  const data = await shopifyFetch<{ count: number }>(domain, accessToken, "/products/count.json");
  return data.count ?? 0;
}

interface ShopifyCollection {
  id: number;
  title: string;
}

/** Fetches custom + smart collections and their product counts (used as the app's "categories"). */
export async function getShopifyCollections(domain: string, accessToken: string): Promise<StoreCategory[]> {
  const [customRes, smartRes] = await Promise.all([
    shopifyFetch<{ custom_collections: ShopifyCollection[] }>(domain, accessToken, "/custom_collections.json?limit=250"),
    shopifyFetch<{ smart_collections: ShopifyCollection[] }>(domain, accessToken, "/smart_collections.json?limit=250"),
  ]);

  const collections = [...(customRes.custom_collections ?? []), ...(smartRes.smart_collections ?? [])];

  return mapWithConcurrency(collections, 4, async (collection): Promise<StoreCategory> => {
    try {
      const countData = await shopifyFetch<{ count: number }>(
        domain,
        accessToken,
        `/collections/${collection.id}/products/count.json`
      );
      return { id: String(collection.id), name: collection.title, productCount: countData.count ?? 0 };
    } catch {
      return { id: String(collection.id), name: collection.title, productCount: 0 };
    }
  });
}
