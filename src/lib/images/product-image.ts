import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import sharp from "sharp";
import { hostnameOf, isHostBlocked, recordHostFailure, recordHostSuccess } from "@/lib/net/host-health";

const FETCH_TIMEOUT_MS = 5_000;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_CACHE_ENTRIES = 300;
const OUTPUT_MAX_PX = 900;

export interface CachedProductImage {
  body: Buffer;
  contentType: "image/jpeg";
}

const imageCache = new Map<string, CachedProductImage>();
const inflight = new Map<string, Promise<CachedProductImage | null>>();

function proxySecret(): string | null {
  return (
    process.env.PRODUCT_IMAGE_PROXY_SECRET ??
    process.env.OPENAI_KEY_ENCRYPTION_SECRET ??
    process.env.INTERNAL_JOB_SECRET ??
    process.env.SUPABASE_SECRET_KEY ??
    null
  );
}

function signature(url: string): string | null {
  const secret = proxySecret();
  return secret ? createHmac("sha256", secret).update(url).digest("base64url") : null;
}

/**
 * Produces a same-origin URL the browser can load without depending directly on the merchant.
 *
 * An environment with no signing secret loses the fallback rather than the product: this runs
 * inside `toProduct`, on the path every rendered result takes, so throwing here would turn a
 * missing optional env var into a catalog that cannot render at all.
 */
export function productImageProxyUrl(sourceUrl: string | null | undefined): string {
  if (!sourceUrl) return "";
  const sig = signature(sourceUrl);
  return sig ? `/api/product-image?url=${encodeURIComponent(sourceUrl)}&sig=${sig}` : "";
}

export function isValidProductImageSignature(url: string, supplied: string): boolean {
  const signed = signature(url);
  if (!supplied || !signed) return false;
  const expected = Buffer.from(signed);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function isPrivateIpv4(address: string): boolean {
  const [a, b] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return isPrivateIpv4(address);
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isPrivateIpv4(normalized.slice(7));
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized)
  );
}

async function assertPublicHttpUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Unsupported product image protocol.");
  }
  if (url.username || url.password) throw new Error("Credentials are not allowed in product image URLs.");

  if (isIP(url.hostname)) {
    if (isPrivateAddress(url.hostname)) throw new Error("Private product image addresses are not allowed.");
  } else {
    const addresses = await lookup(url.hostname, { all: true });
    if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new Error("Product image host does not resolve to a public address.");
    }
  }
  return url;
}

async function fetchSourceImage(sourceUrl: string): Promise<Buffer | null> {
  let current = await assertPublicHttpUrl(sourceUrl);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const response = await fetch(current, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "manual",
      headers: { Accept: "image/avif,image/webp,image/jpeg,image/png,image/*" },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === MAX_REDIRECTS) return null;
      current = await assertPublicHttpUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("image/")) return null;
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_SOURCE_BYTES) return null;

    const body = Buffer.from(await response.arrayBuffer());
    return body.length <= MAX_SOURCE_BYTES ? body : null;
  }
  return null;
}

async function loadAndOptimize(sourceUrl: string): Promise<CachedProductImage | null> {
  try {
    const source = await fetchSourceImage(sourceUrl);
    if (!source) return null;
    const body = await sharp(source)
      .rotate()
      .resize({ width: OUTPUT_MAX_PX, height: OUTPUT_MAX_PX, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();
    return { body, contentType: "image/jpeg" };
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return null;
    console.error("[product-image proxy]", sourceUrl, error);
    return null;
  }
}

/** True when the image host has just failed enough times that a fetch would only buy another
 *  connect timeout. Callers with a fallback of their own use it to skip straight to it. */
export function isProductImageHostDown(sourceUrl: string): boolean {
  return isHostBlocked(hostnameOf(sourceUrl));
}

/** Shared by the HTTP proxy and Gemini vision so a successful fetch serves both consumers. */
export async function getCachedProductImage(sourceUrl: string): Promise<CachedProductImage | null> {
  const hostname = hostnameOf(sourceUrl);
  if (!hostname) return null;

  // Checked before the cache would be consulted for a *missing* entry only — a cached image is
  // still served while its origin is down, which is the entire point of caching it.
  const cached = imageCache.get(sourceUrl);
  if (cached) {
    imageCache.delete(sourceUrl);
    imageCache.set(sourceUrl, cached);
    return cached;
  }

  if (isHostBlocked(hostname)) return null;

  const existing = inflight.get(sourceUrl);
  if (existing) return existing;

  const pending = loadAndOptimize(sourceUrl).then((image) => {
    inflight.delete(sourceUrl);
    if (!image) {
      recordHostFailure(hostname);
      return null;
    }
    recordHostSuccess(hostname);
    imageCache.set(sourceUrl, image);
    if (imageCache.size > MAX_CACHE_ENTRIES) {
      const oldest = imageCache.keys().next().value;
      if (oldest !== undefined) imageCache.delete(oldest);
    }
    return image;
  });
  inflight.set(sourceUrl, pending);
  return pending;
}
