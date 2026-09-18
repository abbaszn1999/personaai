import sharp from "sharp";

/**
 * `#FF00FF` pure magenta — the one fixed color every avatar prompt asks the model to render
 * the subject against. Chosen because it essentially never occurs in skin tones or clothing
 * (unlike green, which does show up in garments).
 */
export const CHROMA_KEY_COLOR = { r: 255, g: 0, b: 255 } as const;

/**
 * An image generator is a photorealistic renderer, not a flat-fill one — even told to render a
 * single uniform flat color with "no gradients, shadows, or texture," it still applies its
 * own learned photographic lighting falloff, vignetting, and grain on top, because that's what
 * every real studio photo it was trained on looks like. So the backdrop comes back as a
 * "wavy"/uneven magenta rather than a mathematically solid one, and the exact hue/brightness
 * drift varies per-generation (worse on some outfit styles than others).
 *
 * A plain Euclidean distance from pure magenta is fragile against that: it conflates hue with
 * brightness, so a *dim* magenta (in shadow near the floor) reads as "far" from a bright pure
 * magenta even though it's clearly still the same backdrop color. Instead we key on
 * `min(r, b) - g` — how much the red+blue channels dominate green. That ratio stays large and
 * stable across brightness/lighting variation (a dim magenta and a bright magenta both have
 * R and B far above G), while every measured subject color (skin, hair, fabric) scores
 * negative or near-zero, giving a wide, robust separation margin.
 */
const INNER_THRESHOLD = 60;
/** Below this the pixel is fully opaque (subject); above INNER_THRESHOLD it's fully transparent. */
const OUTER_THRESHOLD = 20;
/** Softens the per-pixel threshold boundary into a natural-looking anti-aliased edge. */
const FEATHER_BLUR_SIGMA = 1;

export class BackgroundRemovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackgroundRemovalError";
  }
}

/**
 * Puts a transparent cut-out back on a solid magenta plate, as lossless PNG.
 *
 * This is the inverse of {@link stripBackgroundToTransparent} and exists because try-on is a
 * localised edit: it preserves whatever is outside the garment regions, background included.
 * Feeding it the stored avatar — a transparent PNG — would hand it an alpha channel it has no
 * reason to respect, and a model that flattens alpha to black or white leaves nothing for the
 * chroma key to find on the way back out.
 *
 * Re-keying from the stored avatar rather than caching the generator's original backdrop keeps
 * the round trip stateless, and the plate it lays down is mathematically uniform — cleaner to
 * key against than the uneven magenta a generator produces.
 *
 * A fully opaque input (a shopper's own uploaded avatar, which has a real background) is
 * returned effectively unchanged: there is no alpha to fill, so nothing is keyed out
 * afterwards and the render keeps its natural backdrop.
 */
export async function flattenOntoChromaKey(imageBase64: string): Promise<Buffer> {
  try {
    return await sharp(Buffer.from(imageBase64, "base64"))
      .flatten({ background: CHROMA_KEY_COLOR })
      .png()
      .toBuffer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chroma-key flattening failed.";
    throw new BackgroundRemovalError(message);
  }
}

/** How strongly a pixel reads as the magenta chroma key, independent of overall brightness. */
function magentaKeyStrength(r: number, g: number, b: number): number {
  return Math.min(r, b) - g;
}

/**
 * Thresholds pixels by {@link magentaKeyStrength} to transparent and re-encodes as PNG (the
 * only format that carries an alpha channel — the input `mimeType` may be jpeg).
 */
export async function stripBackgroundToTransparent(
  imageBase64: string,
  _mimeType: string
): Promise<{ imageBase64: string; mimeType: "image/png" }> {
  try {
    const inputBuffer = Buffer.from(imageBase64, "base64");
    const { data, info } = await sharp(inputBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    const pixels = Buffer.from(data);
    const totalPixels = width * height;

    const alphaMask = Buffer.alloc(totalPixels);
    for (let i = 0, p = 0; i < pixels.length; i += channels, p++) {
      const keyStrength = magentaKeyStrength(pixels[i], pixels[i + 1], pixels[i + 2]);
      let alpha = 255;
      if (keyStrength >= INNER_THRESHOLD) {
        alpha = 0;
      } else if (keyStrength > OUTER_THRESHOLD) {
        alpha = Math.round((1 - (keyStrength - OUTER_THRESHOLD) / (INNER_THRESHOLD - OUTER_THRESHOLD)) * 255);
      }
      alphaMask[p] = alpha;
    }

    // `.toColourspace("b-w")` is required — sharp silently upconverts a single-channel raw
    // buffer to 3-channel sRGB on `.raw()` output otherwise, which would desync every byte
    // index in the loop below against the single-channel `alphaMask` we built above.
    const featheredAlpha = await sharp(alphaMask, { raw: { width, height, channels: 1 } })
      .blur(FEATHER_BLUR_SIGMA)
      .toColourspace("b-w")
      .raw()
      .toBuffer();

    for (let i = 0, p = 0; i < pixels.length; i += channels, p++) {
      pixels[i + 3] = Math.min(pixels[i + 3], featheredAlpha[p]);
    }

    const outputBuffer = await sharp(pixels, { raw: { width, height, channels } })
      .png()
      .toBuffer();

    return { imageBase64: outputBuffer.toString("base64"), mimeType: "image/png" };
  } catch (err) {
    if (err instanceof BackgroundRemovalError) throw err;
    const message = err instanceof Error ? err.message : "Background removal failed.";
    throw new BackgroundRemovalError(message);
  }
}
