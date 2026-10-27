/**
 * The look picture as the small JPEG the prompt-writing model reads.
 *
 * The model only needs to see the garments, so 768 px on the long side is plenty and keeps the
 * upload to roughly 100 KB instead of the megabytes the full render weighs. A cut-out avatar is
 * flattened onto white, exactly as `prepareReferenceImage` does for Decart, so the model reads the
 * same picture Decart will. Returns null when the browser cannot decode or re-encode it; the
 * caller then keeps the catalog prompt.
 */
const MAX_SIDE_PX = 768;
const JPEG_QUALITY = 0.85;
/** Mirrors the server's limit (`LOOK_IMAGE_MAX_CHARS`); a bigger picture is not worth sending. */
const MAX_DATA_URL_CHARS = 1_500_000;

export async function lookImageForDescription(blob: Blob): Promise<string | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }
  try {
    const scale = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const encoded = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    return encoded.startsWith("data:image/jpeg") && encoded.length <= MAX_DATA_URL_CHARS ? encoded : null;
  } catch {
    return null;
  } finally {
    bitmap.close?.();
  }
}
