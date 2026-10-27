/**
 * The body of a live look-description request: the avatar render the shopper is about to wear on
 * camera, shrunk by the browser, plus the store's item titles (a hint for naming an item, never a
 * source of details). Parsed here, away from the routes, so both of them accept exactly the same
 * thing and nothing else.
 */

/** A 768 px JPEG is well under this; it only stops a client from posting an arbitrary file. */
export const LOOK_IMAGE_MAX_CHARS = 1_500_000;
const MAX_ITEMS = 12;
const MAX_ITEM_CHARS = 120;

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

export interface LookRequest {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  /** Base64 without the `data:` prefix, as Gemini takes it. */
  data: string;
  itemNames: string[];
}

export function parseLookRequest(body: unknown): LookRequest | null {
  if (!body || typeof body !== "object") return null;
  const { image, itemNames } = body as { image?: unknown; itemNames?: unknown };
  if (typeof image !== "string" || image.length > LOOK_IMAGE_MAX_CHARS) return null;
  const match = DATA_URL.exec(image);
  if (!match) return null;

  const names = Array.isArray(itemNames)
    ? itemNames
        .filter((name): name is string => typeof name === "string")
        .map((name) => name.replace(/\s+/g, " ").trim().slice(0, MAX_ITEM_CHARS))
        .filter(Boolean)
        .slice(0, MAX_ITEMS)
    : [];

  return { mimeType: match[1] as LookRequest["mimeType"], data: match[2], itemNames: names };
}
