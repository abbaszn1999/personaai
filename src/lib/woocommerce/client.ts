import type { StoreCategory } from "@/modules/store/types";

const API_BASE = "/wp-json/wc/v3";

export class WooCommerceApiError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = "WooCommerceApiError";
  }
}

/**
 * Normalizes user input (`example.com`, `www.example.com`, `http://example.com/`)
 * into a bare `https://example.com` origin suitable for WordPress REST API calls.
 * Unlike Shopify, WordPress sites use arbitrary domains — there's no platform-owned
 * suffix to append.
 */
export function normalizeWordPressUrl(input: string): string {
  let url = input.trim();
  url = url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${url}`;
}

/** Builds the `Authorization: Basic ...` header for a WordPress Application Password. */
function buildAuthHeader(username: string, appPassword: string): string {
  const token = Buffer.from(`${username}:${appPassword}`).toString("base64");
  return `Basic ${token}`;
}

interface WooCommerceErrorBody {
  message?: string;
  code?: string;
}

async function wooFetch<T>(
  siteUrl: string,
  username: string,
  appPassword: string,
  path: string
): Promise<{ data: T; headers: Headers }> {
  const res = await fetch(`${siteUrl}${API_BASE}${path}`, {
    headers: {
      Authorization: buildAuthHeader(username, appPassword),
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body: WooCommerceErrorBody | null = await res.json().catch(() => null);
    throw new WooCommerceApiError(
      body?.message || `WordPress API request failed (${res.status})`,
      res.status
    );
  }

  const data = (await res.json()) as T;
  return { data, headers: res.headers };
}

/**
 * Confirms the site URL + WordPress Application Password are valid by fetching a
 * single product. Also returns a best-effort store name from the site's WordPress
 * REST API root, falling back to the hostname if unavailable. Throws on failure.
 */
export async function verifyWordPressCredentials(
  siteUrl: string,
  username: string,
  appPassword: string
): Promise<{ name: string }> {
  await wooFetch<unknown[]>(siteUrl, username, appPassword, "/products?per_page=1");

  try {
    const res = await fetch(`${siteUrl}/wp-json`, { cache: "no-store" });
    if (res.ok) {
      const data: { name?: string } = await res.json();
      if (data.name) return { name: data.name };
    }
  } catch {
    // Non-fatal — fall through to the hostname fallback below.
  }

  return { name: new URL(siteUrl).hostname };
}

/**
 * Reads the total product count from the `X-WP-Total` response header — WooCommerce
 * has no dedicated count endpoint like Shopify, but every list endpoint reports the
 * total in this header regardless of `per_page`.
 */
export async function getWordPressProductCount(
  siteUrl: string,
  username: string,
  appPassword: string
): Promise<number> {
  const { headers } = await wooFetch<unknown[]>(siteUrl, username, appPassword, "/products?per_page=1");
  return Number(headers.get("x-wp-total") ?? 0);
}

interface WooCommerceCategory {
  id: number;
  name: string;
  count: number;
}

/**
 * Fetches product categories and their product counts in a single request — the
 * WooCommerce categories endpoint includes `count` inline, unlike Shopify's
 * collections which need a separate per-collection count call.
 */
export async function getWordPressCategories(
  siteUrl: string,
  username: string,
  appPassword: string
): Promise<StoreCategory[]> {
  const { data } = await wooFetch<WooCommerceCategory[]>(
    siteUrl,
    username,
    appPassword,
    "/products/categories?per_page=100"
  );

  return data.map((category) => ({
    id: String(category.id),
    name: category.name,
    productCount: category.count ?? 0,
  }));
}
