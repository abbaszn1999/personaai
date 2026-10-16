import sharp from "sharp";
import {
  fetchPublicImage,
  getCachedProductImage,
  isProductImageHostDown,
} from "@/lib/images/product-image";
import { PersonaAgentError } from "@/lib/try-on/errors";

/**
 * Loading the pictures a render is built from.
 *
 * This used to be a bare `fetch` with no timeout, no size limit and no retry: one slow or
 * rate-limiting storefront CDN stalled the whole render until the platform cut the connection,
 * which the shopper saw as "Failed to fetch". It also fetched whatever URL the browser named,
 * from inside the server's network. Everything here is bounded and goes through
 * `fetchPublicImage`, which refuses non-public addresses.
 */

const IMAGE_FETCH_TIMEOUT_MS = 8_000;
const IMAGE_FETCH_ATTEMPTS = 2;
const IMAGE_RETRY_DELAY_MS = 400;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
/** Rejects decompression bombs: a 12 MB PNG can describe a billion pixels. */
const MAX_INPUT_PIXELS = 50_000_000;
/** A reference picture needs detail, not poster size; larger only costs tokens and memory. */
const GARMENT_MAX_PX = 1600;

// libvips keeps decoded operations in a cache and spawns a thread per core by default. Renders
// never reuse an input, so the cache is only memory held on a small instance, and a few threads
// per image already saturate it.
sharp.cache(false);
sharp.concurrency(2);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetches a public image, retrying once on a timeout, a network error or an unusable answer. */
async function fetchWithRetry(url: string): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= IMAGE_FETCH_ATTEMPTS; attempt++) {
    try {
      const fetched = await fetchPublicImage(url, {
        maxBytes: MAX_IMAGE_BYTES,
        timeoutMs: IMAGE_FETCH_TIMEOUT_MS,
      });
      if (fetched) return fetched.body;
    } catch {
      // A timeout, a reset connection, or a refused private address; the next attempt decides.
    }
    if (attempt < IMAGE_FETCH_ATTEMPTS) await wait(IMAGE_RETRY_DELAY_MS);
  }
  return null;
}

/** True when `url` points at this app, which `fetchPublicImage` refuses on a private network. */
function isOwnOrigin(url: string): boolean {
  try {
    const appUrl = process.env.APP_URL;
    return Boolean(appUrl) && new URL(url).host === new URL(appUrl as string).host;
  } catch {
    return false;
  }
}

/** Reads a `data:` URL or a remote image URL into raw bytes. */
export async function readImageBytes(urlOrDataUrl: string): Promise<Buffer> {
  const dataUrlMatch = /^data:[^;]+;base64,(.+)$/.exec(urlOrDataUrl);
  if (dataUrlMatch) {
    const bytes = Buffer.from(dataUrlMatch[1], "base64");
    if (bytes.length === 0) throw new PersonaAgentError("Your avatar picture is empty.", "avatar_image");
    return bytes;
  }

  const fetched = await fetchWithRetry(urlOrDataUrl);
  if (fetched) return fetched;

  if (isOwnOrigin(urlOrDataUrl)) {
    try {
      const res = await fetch(urlOrDataUrl, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      // Falls through to the error below.
    }
  }

  throw new PersonaAgentError("Couldn't load your avatar picture. Please try again.", "avatar_image");
}

function toJpeg(source: Buffer): Promise<Buffer> {
  return sharp(source, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: GARMENT_MAX_PX, height: GARMENT_MAX_PX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * Fetches one garment reference and transcodes it to JPEG.
 *
 * The transcode is the point: most storefronts serve WebP and many block hotlinking, so the
 * model is sent the bytes rather than the merchant's URL, and the render's success does not
 * depend on the merchant's CDN policy. It also applies EXIF rotation, so the model sees the
 * garment the way a shopper does.
 *
 * The original is tried first, for detail. If the store's image host is down or slow, the copy
 * the widget already displayed (cached by the product-image proxy) is used instead, so a flaky
 * CDN costs resolution rather than the whole render.
 */
export async function loadGarmentReference(imageUrl: string): Promise<Buffer> {
  if (imageUrl.startsWith("data:")) {
    try {
      return await toJpeg(await readImageBytes(imageUrl));
    } catch {
      throw new PersonaAgentError("One of the item pictures could not be read.", "garment_image");
    }
  }

  if (!isProductImageHostDown(imageUrl)) {
    const original = await fetchWithRetry(imageUrl);
    if (original) {
      try {
        return await toJpeg(original);
      } catch {
        // An undecodable original is treated like an unreachable one; the cached copy may differ.
      }
    }
  }

  const cached = await getCachedProductImage(imageUrl);
  if (cached) return cached.body;

  throw new PersonaAgentError(
    "Couldn't load one of the item pictures from the store. Please try again.",
    "garment_image",
  );
}
