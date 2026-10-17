/**
 * Finds where the person stands inside an avatar picture, so measurement marks (height arrow,
 * chest and waist lines) can be drawn on the body instead of at guessed positions.
 *
 * An avatar is one person standing in the middle of a plain backdrop, so a coarse scan of a
 * small copy of the picture is enough. On each row the body's outer edges are the first strong
 * colour change coming in from the left and from the right. Edges are used rather than
 * "differs from the backdrop colour" because the studio backdrops have lighting gradients and
 * vignettes that would otherwise read as person, while a shirt close in colour to the backdrop
 * would leave holes.
 *
 * Pure function over RGBA pixels — no DOM — so it is unit-testable; `useBodyBounds` feeds it a
 * canvas. Coordinates are fractions of the image (0-1), so they hold for any rendered size.
 */

export interface BodyRun {
  /** Fraction of the image width. */
  left: number;
  right: number;
}

export interface BodyBounds {
  /** Top of the head and bottom of the feet, as fractions of the image height. */
  top: number;
  bottom: number;
  /** Leftmost / rightmost body pixel anywhere between top and bottom (fraction of width). */
  leftmost: number;
  rightmost: number;
  /** Outer left-to-right extent of the body on the row at `y` (fraction of the image height):
   *  arm to arm at chest height, shoe to shoe at the bottom. Null if that row has no body. */
  extentAt(y: number): BodyRun | null;
  /** On a cut-out, the unbroken run of body through the middle of the figure on the row at `y`:
   *  just the torso where the arms hang clear of it, the same as `extentAt` where they touch.
   *  Without an alpha channel there is no telling arms from torso, so it equals `extentAt`. */
  torsoAt(y: number): BodyRun | null;
}

/** Colour change between neighbouring pixels (summed over RGB) that counts as the body's
 *  edge. Backdrop gradients change by 1-3 per pixel on the small scan copy; a body outline
 *  changes by tens. */
const EDGE_STEP = 16;
/** Pixels at the very edge of the picture are never read, so a vignette or border is ignored. */
const EDGE_MARGIN = 2;
/** A row narrower than this share of the width is noise, not a body. */
const MIN_ROW_SHARE = 0.03;
/** Plausibility: a standing person fills most of the frame's height. */
const MIN_BODY_HEIGHT_SHARE = 0.4;
/** More than this share of see-through pixels means the picture is a cut-out. */
const TRANSPARENT_SHARE = 0.01;

type Extent = [number, number] | null;

function extentsFromAlpha(data: Uint8ClampedArray, width: number, height: number): Extent[] {
  return Array.from({ length: height }, (_, y) => {
    const row = y * width;
    let first = -1;
    let last = -1;
    for (let x = 0; x < width; x++) {
      if (data[(row + x) * 4 + 3] >= 128) {
        if (first < 0) first = x;
        last = x;
      }
    }
    return first < 0 ? null : [first, last + 1];
  });
}

function extentsFromEdges(data: Uint8ClampedArray, width: number, height: number): Extent[] {
  const step = (a: number, b: number) =>
    Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]);

  return Array.from({ length: height }, (_, y) => {
    const row = y * width;
    let first = -1;
    for (let x = EDGE_MARGIN; x < width - EDGE_MARGIN; x++) {
      if (step((row + x) * 4, (row + x - 1) * 4) > EDGE_STEP) {
        first = x;
        break;
      }
    }
    if (first < 0) return null;
    let last = -1;
    for (let x = width - EDGE_MARGIN - 1; x >= first; x--) {
      if (step((row + x) * 4, (row + x + 1) * 4) > EDGE_STEP) {
        last = x + 1;
        break;
      }
    }
    return last > first ? [first, last] : null;
  });
}

export function findBodyBounds(data: Uint8ClampedArray, width: number, height: number): BodyBounds | null {
  if (width < 16 || height < 16 || data.length < width * height * 4) return null;

  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 200) transparent++;
  const cutOut = transparent / (width * height) > TRANSPARENT_SHARE;
  const raw = cutOut ? extentsFromAlpha(data, width, height) : extentsFromEdges(data, width, height);

  const minWidth = Math.max(2, Math.round(width * MIN_ROW_SHARE));
  const rows: Extent[] = raw.map((e) => (e && e[1] - e[0] >= minWidth ? e : null));

  // Two rows in a row, so a single stray line can't pose as the top of the head.
  let top = -1;
  for (let y = 0; y < height - 1; y++) {
    if (rows[y] && rows[y + 1]) {
      top = y;
      break;
    }
  }
  let bottom = -1;
  for (let y = height - 1; y > 0; y--) {
    if (rows[y] && rows[y - 1]) {
      bottom = y;
      break;
    }
  }
  if (top < 0 || bottom <= top) return null;
  if ((bottom - top + 1) / height < MIN_BODY_HEIGHT_SHARE) return null;

  let leftmost = width;
  let rightmost = 0;
  for (let y = top; y <= bottom; y++) {
    const e = rows[y];
    if (!e) continue;
    if (e[0] < leftmost) leftmost = e[0];
    if (e[1] > rightmost) rightmost = e[1];
  }

  const rowAt = (y: number) => Math.min(height - 1, Math.max(0, Math.round(y * (height - 1))));
  const toRun = (e: [number, number]): BodyRun => ({ left: e[0] / width, right: e[1] / width });
  const solid = (row: number, x: number) => data[(row * width + x) * 4 + 3] >= 128;

  return {
    top: top / height,
    bottom: (bottom + 1) / height,
    leftmost: leftmost / width,
    rightmost: rightmost / width,
    extentAt(y) {
      const e = rows[rowAt(y)];
      return e ? toRun(e) : null;
    },
    torsoAt(y) {
      const row = rowAt(y);
      const e = rows[row];
      if (!e) return null;
      if (!cutOut) return toRun(e);
      const centre = Math.round((e[0] + e[1]) / 2);
      if (!solid(row, centre)) return toRun(e);
      let left = centre;
      while (left > e[0] && solid(row, left - 1)) left--;
      let right = centre;
      while (right < e[1] - 1 && solid(row, right + 1)) right++;
      return right + 1 - left >= minWidth ? toRun([left, right + 1]) : toRun(e);
    },
  };
}
