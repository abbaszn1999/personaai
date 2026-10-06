import { createDecartClient } from "@decartai/sdk";
import { fetchPublicImage } from "@/lib/images/product-image";

export const DECART_REALTIME_MODEL = "lucy-vton-latest" as const;
export const REALTIME_TRYON_SESSION_CAP_SECONDS = 90;

export class DecartApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "DecartApiError";
  }
}

let cachedClient: ReturnType<typeof createDecartClient> | null = null;

function getDecartClient() {
  const apiKey = process.env.DECART_API_KEY;
  if (!apiKey) {
    throw new DecartApiError("Decart API key is not configured (DECART_API_KEY).");
  }

  if (!cachedClient) {
    cachedClient = createDecartClient({ apiKey });
  }
  return cachedClient;
}

export async function createDecartClientToken(
  maxSessionDuration = REALTIME_TRYON_SESSION_CAP_SECONDS
) {
  try {
    return await getDecartClient().tokens.create({
      expiresIn: 600,
      allowedModels: [DECART_REALTIME_MODEL],
      constraints: {
        realtime: {
          maxSessionDuration: Math.max(
            1,
            Math.min(REALTIME_TRYON_SESSION_CAP_SECONDS, Math.floor(maxSessionDuration))
          ),
        },
      },
    });
  } catch (error) {
    if (error instanceof DecartApiError) throw error;
    const message = error instanceof Error ? error.message : "Unable to create a Decart client token.";
    throw new DecartApiError(message);
  }
}

const REFERENCE_IMAGE_MAX_BYTES = 8 * 1024 * 1024; // 8MB
const REFERENCE_IMAGE_FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetches a product image server-side so the browser never has to `fetch()` a merchant's CDN
 * URL directly. Reading response bytes cross-origin (unlike loading an `<img>`) requires the
 * remote host to opt in with CORS headers, which most WooCommerce/self-hosted media libraries
 * never send — the live embed only "just works" because the widget shares the merchant's own
 * origin. This runs the fetch on the server instead, where CORS doesn't apply at all.
 */
export async function fetchReferenceImageAsBase64(
  imageUrl: string
): Promise<{ base64: string; mimeType: string }> {
  try {
    new URL(imageUrl);
  } catch {
    throw new DecartApiError("Invalid reference image URL.", 400);
  }

  try {
    // The URL comes from a browser, so it goes through the public-internet-only image fetch.
    const image = await fetchPublicImage(imageUrl, {
      maxBytes: REFERENCE_IMAGE_MAX_BYTES,
      timeoutMs: REFERENCE_IMAGE_FETCH_TIMEOUT_MS,
    });
    if (!image) throw new DecartApiError("That reference image could not be loaded.", 400);
    return { base64: image.body.toString("base64"), mimeType: image.contentType };
  } catch (error) {
    if (error instanceof DecartApiError) throw error;
    const message =
      error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")
        ? "Reference image request timed out."
        : "That reference image could not be loaded.";
    throw new DecartApiError(message, error instanceof Error && error.name === "TimeoutError" ? 504 : 400);
  }
}
