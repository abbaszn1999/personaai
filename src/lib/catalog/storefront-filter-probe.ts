import type { BrandFilterSource } from "./storefront-links";

/**
 * Whether a Shopify storefront will actually apply a brand filter from the URL.
 *
 * `?filter.p.vendor=X` only narrows a collection when the theme supports storefront filtering and the
 * Vendor filter is switched on in Search & Discovery; otherwise Shopify ignores the parameter and
 * shows the whole collection. The collection page itself says which: a theme that offers the filter
 * renders a control named after the parameter. Reading that once is how a link can honestly say
 * "filtered to X" or "opens the whole collection".
 */
export type FilterSupport = "supported" | "unsupported" | "unreachable";

export function shopifyFilterParameter(source: BrandFilterSource): string | null {
  switch (source.kind) {
    case "vendor":
      return "filter.p.vendor";
    case "option":
      return `filter.v.option.${source.group}`;
    case "metafield":
      return `filter.p.m.${source.namespace}.${source.key}`;
    default:
      return null;
  }
}

/** True when the page renders a filter control, or links, for this parameter. */
export function pageOffersFilter(html: string, parameter: string): boolean {
  const escaped = parameter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // A form control's name, or a link/query carrying it (with the `&amp;` an HTML attribute gives).
  return new RegExp(`(?:name=["']|[?&;]|&amp;)${escaped}(?:["']|=|%5B)`, "i").test(html);
}

const TTL_MS = 24 * 60 * 60 * 1000;
const PROBE_TIMEOUT_MS = 6_000;

interface CachedProbe {
  at: number;
  support: FilterSupport;
}

function cache(): Map<string, CachedProbe> {
  const holder = globalThis as typeof globalThis & { __personaFilterProbe?: Map<string, CachedProbe> };
  return (holder.__personaFilterProbe ??= new Map());
}

/** Clears remembered answers; exists for tests and for a merchant who just changed their filters. */
export function forgetFilterProbes(): void {
  cache().clear();
}

/**
 * Reads one collection page and reports whether the theme offers the filter. Remembered per store and
 * parameter for a day: the answer changes only when the merchant edits their theme or filters, and
 * the page is a full storefront render.
 *
 * `unreachable` covers a password-protected store, a timeout and any non-page answer. It is not
 * remembered, so the next request tries again.
 */
export async function probeShopifyFilter(
  base: string,
  collectionHandle: string,
  parameter: string,
): Promise<FilterSupport> {
  const key = `${base}|${parameter}`;
  const hit = cache().get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.support;

  try {
    const response = await fetch(`${base}/collections/${encodeURIComponent(collectionHandle)}`, {
      headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; PersonaFilterProbe/1.0)" },
      redirect: "follow",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok || /\/password\b/.test(response.url)) return "unreachable";
    const html = await response.text();
    const support: FilterSupport = pageOffersFilter(html, parameter) ? "supported" : "unsupported";
    cache().set(key, { at: Date.now(), support });
    return support;
  } catch {
    return "unreachable";
  }
}
