import { createDecartClient } from "@decartai/sdk";

export const DECART_REALTIME_MODEL = "lucy-vton-3" as const;
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
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    throw new DecartApiError("Invalid reference image URL.", 400);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new DecartApiError("Reference image URL must be http(s).", 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REFERENCE_IMAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(parsed, { signal: controller.signal });
    if (!response.ok) {
      throw new DecartApiError(`Reference image request failed (${response.status}).`, 502);
    }
    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > REFERENCE_IMAGE_MAX_BYTES) {
      throw new DecartApiError("Reference image is too large.", 413);
    }
    return { base64: Buffer.from(buffer).toString("base64"), mimeType };
  } catch (error) {
    if (error instanceof DecartApiError) throw error;
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Reference image request timed out."
        : error instanceof Error
          ? error.message
          : "Unable to fetch the reference image.";
    throw new DecartApiError(message, 502);
  } finally {
    clearTimeout(timeout);
  }
}
