import sharp from "sharp";

/**
 * Decides, from the picture's header alone, whether its bytes can go to the model exactly as they
 * are. `sharp(...).metadata()` does not decode the picture, so asking costs almost nothing, while a
 * decode and re-encode of a 1K portrait costs real time and, for PNG, several megabytes more to upload.
 *
 * The model reads PNG, JPEG and WebP. A picture is only rewritten when it has to be: it carries an EXIF
 * rotation the model would not apply, or it is in a format the model does not read.
 */

const MIME_BY_FORMAT: Readonly<Record<string, string>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Colour spaces the model reads as a normal photograph; CMYK and 16-bit spaces are rewritten. */
const PLAIN_COLOUR_SPACES = new Set(["srgb", "b-w"]);

/** The longest side the avatar-creation photo is brought down to when it has to be rewritten. */
export const PHOTO_MAX_SIDE_PX = 1536;
/** A photo above this is rewritten smaller even when its dimensions are fine (a PNG photo, say). */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

export interface PreparedImage {
  data: Buffer;
  mimeType: string;
}

interface Header {
  mimeType: string | null;
  rotated: boolean;
  alpha: boolean;
  plainColour: boolean;
  animated: boolean;
  width: number;
  height: number;
}

async function readHeader(bytes: Buffer): Promise<Header> {
  const meta = await sharp(bytes).metadata();
  return {
    mimeType: (meta.format && MIME_BY_FORMAT[meta.format]) || null,
    // EXIF orientation 1 (or none) means the picture is already upright.
    rotated: typeof meta.orientation === "number" && meta.orientation > 1,
    alpha: Boolean(meta.hasAlpha),
    plainColour: !meta.space || PLAIN_COLOUR_SPACES.has(meta.space),
    animated: typeof meta.pages === "number" && meta.pages > 1,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };
}

/**
 * The avatar a try-on dresses. Sent as stored, with its own type, unless it needs an EXIF rotation or
 * is in a format the model does not read, in which case it becomes an upright PNG as before.
 */
export async function prepareAvatarForTryOn(bytes: Buffer): Promise<PreparedImage> {
  const header = await readHeader(bytes);
  if (header.mimeType && !header.rotated && header.plainColour && !header.animated) {
    return { data: bytes, mimeType: header.mimeType };
  }
  return { data: await sharp(bytes).rotate().png().toBuffer(), mimeType: "image/png" };
}

export interface PhotoLimits {
  maxSidePx?: number;
  maxBytes?: number;
}

/**
 * The shopper's own photo for avatar creation. It can be anything, so it is only sent as it is when
 * every check passes: a readable format, upright, no larger than the cap in either direction and in
 * bytes, no transparency, an ordinary colour space and a single frame. Anything else is rotated,
 * resized to the cap and saved as a JPEG, which is what every photo went through before.
 */
export async function preparePhotoForAvatar(bytes: Buffer, limits: PhotoLimits = {}): Promise<PreparedImage> {
  const maxSide = limits.maxSidePx ?? PHOTO_MAX_SIDE_PX;
  const maxBytes = limits.maxBytes ?? PHOTO_MAX_BYTES;

  const header = await readHeader(bytes);
  const fine =
    header.mimeType !== null &&
    !header.rotated &&
    !header.alpha &&
    header.plainColour &&
    !header.animated &&
    header.width > 0 &&
    Math.max(header.width, header.height) <= maxSide &&
    bytes.length <= maxBytes;
  if (fine && header.mimeType) return { data: bytes, mimeType: header.mimeType };

  const data = await sharp(bytes)
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();
  return { data, mimeType: "image/jpeg" };
}
