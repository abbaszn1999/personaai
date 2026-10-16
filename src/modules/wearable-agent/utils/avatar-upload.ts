/**
 * Shrinks the avatar before it is sent with a try-on request.
 *
 * The avatar is a transparent PNG held as a `data:` URL, easily several megabytes, and it travels
 * with every Wear tap. Uploading that over a mobile connection is the slowest and least reliable
 * part of a render, and the model only ever sees it at about 1K anyway. A bounded WebP (which
 * keeps the transparency the server cuts the person out with) is a fraction of the size.
 *
 * Anything that cannot be re-encoded (a browser without WebP encoding falls back to PNG, a
 * decode error) is sent unchanged, so this can only make a request lighter, never fail it.
 */

/** Below this a data URL is already light enough to send as is. */
const MIN_DATA_URL_CHARS = 1_200_000;
const MAX_SIDE_PX = 1024;
const WEBP_QUALITY = 0.92;
const MAX_CACHED = 4;

const compacted = new Map<string, string>();

export async function compactAvatarForUpload(url: string): Promise<string> {
  if (!url.startsWith("data:") || url.length < MIN_DATA_URL_CHARS) return url;
  const cached = compacted.get(url);
  if (cached) return cached;

  let result = url;
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();

    const scale = Math.min(1, MAX_SIDE_PX / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (context) {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const encoded = canvas.toDataURL("image/webp", WEBP_QUALITY);
      if (encoded.startsWith("data:image/webp") && encoded.length < url.length) result = encoded;
    }
  } catch {
    result = url;
  }

  // The same avatar is sent again on every Wear, so the work is done once.
  if (compacted.size >= MAX_CACHED) {
    const oldest = compacted.keys().next().value;
    if (oldest !== undefined) compacted.delete(oldest);
  }
  compacted.set(url, result);
  return result;
}
