/**
 * Prepares the look picture for Decart's live try-on. Their guidance for a reference image:
 * JPEG, PNG or WebP, at least 512 px, under 5 MB for a fast upload, and no more than about 2048 px
 * on the long side. The picture travels to Decart as base64 over the live connection, so an
 * oversized one makes the swap slow.
 */
export const REFERENCE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const REFERENCE_IMAGE_MAX_SIDE = 2048;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALPHA_TYPES = new Set(["image/png", "image/webp"]);
const JPEG_QUALITIES = [0.9, 0.8, 0.7, 0.6];
/** Side of the thumbnail used to look for transparency; enough to see a cut-out's empty corners. */
const ALPHA_PROBE_SIDE = 64;
const OPAQUE_ALPHA = 250;

/** Scales `width` x `height` down to fit `maxSide` on the long side; never scales up. */
export function fitWithin(width: number, height: number, maxSide = REFERENCE_IMAGE_MAX_SIDE) {
  const longest = Math.max(width, height);
  if (!(longest > maxSide) || !(width > 0) || !(height > 0)) return { width, height, scaled: false };
  const ratio = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    scaled: true,
  };
}

/** Whether RGBA pixel data has any see-through pixel. */
export function hasTranslucentPixels(rgba: ArrayLike<number>): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < OPAQUE_ALPHA) return true;
  }
  return false;
}

/**
 * Whether a picture can go to Decart exactly as it is. `transparent` is true for a cut-out with a
 * see-through background: Decart would read that as black or garbage, so it must be flattened.
 */
export function needsPreparation(input: {
  type: string;
  size: number;
  width: number;
  height: number;
  transparent?: boolean;
}): boolean {
  return (
    !ACCEPTED_TYPES.has(input.type.toLowerCase()) ||
    input.size > REFERENCE_IMAGE_MAX_BYTES ||
    fitWithin(input.width, input.height).scaled ||
    Boolean(input.transparent)
  );
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function bitmapHasTransparency(bitmap: ImageBitmap): boolean {
  const scale = Math.min(1, ALPHA_PROBE_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(bitmap, 0, 0, width, height);
  try {
    return hasTranslucentPixels(context.getImageData(0, 0, width, height).data);
  } catch {
    return false;
  }
}

/**
 * Returns `blob` unchanged when Decart can take it as is. Otherwise redraws it within 2048 px as an
 * opaque white-backed JPEG, lowering the quality until it is under 5 MB. A pre-existing cut-out
 * avatar (transparent PNG) is flattened this way too. If the browser can't decode the picture the
 * original goes through, so a preparation problem never blocks a try-on.
 */
export async function prepareReferenceImage(blob: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return blob;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return blob;
  }
  try {
    const transparent = ALPHA_TYPES.has(blob.type.toLowerCase()) && bitmapHasTransparency(bitmap);
    if (!needsPreparation({ type: blob.type, size: blob.size, width: bitmap.width, height: bitmap.height, transparent })) {
      return blob;
    }
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return blob;
    // JPEG has no transparency; a cut-out would otherwise turn black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    let best: Blob | null = null;
    for (const quality of JPEG_QUALITIES) {
      const candidate = await canvasToBlob(canvas, quality);
      if (!candidate) break;
      best = candidate;
      if (candidate.size <= REFERENCE_IMAGE_MAX_BYTES) break;
    }
    return best ?? blob;
  } finally {
    bitmap.close?.();
  }
}
