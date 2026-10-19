import { createDecartClient } from "@decartai/sdk";

export const DECART_REALTIME_MODEL = "lucy-vton-latest" as const;
export const REALTIME_TRYON_SESSION_CAP_SECONDS = 90;
/** Decart rejects a client token whose `maxSessionDuration` is under 10 seconds. */
export const REALTIME_TRYON_MIN_SESSION_SECONDS = 10;

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
  // Fewer seconds than Decart's minimum would fail with a generic token error, so say what is
  // actually wrong. The routes pass this message and status straight to the shopper.
  if (Math.floor(maxSessionDuration) < REALTIME_TRYON_MIN_SESSION_SECONDS) {
    throw new DecartApiError("There isn't enough live try-on time left for a session.", 402);
  }
  try {
    return await getDecartClient().tokens.create({
      expiresIn: 600,
      allowedModels: [DECART_REALTIME_MODEL],
      constraints: {
        realtime: {
          maxSessionDuration: Math.min(REALTIME_TRYON_SESSION_CAP_SECONDS, Math.floor(maxSessionDuration)),
        },
      },
    });
  } catch (error) {
    if (error instanceof DecartApiError) throw error;
    // The SDK throws plain `{ code, message, data }` objects, not `Error`s, so an `instanceof Error`
    // check alone would discard Decart's actual reason (e.g. "Failed to create token: 403 - ...").
    // Logged server-side only: the route returns this error's message to the shopper's browser.
    const detail =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message
          : String(error);
    console.error("[decart] client token request failed:", detail);
    throw new DecartApiError("Unable to create a Decart client token.");
  }
}
