/**
 * Where the measurement marks go on an avatar picture, from the shopper's stats and the
 * detected body (see `body-bounds.ts`). Pure — everything is a fraction of the picture
 * (0-1) so it holds at any rendered size; `measurement-overlay.tsx` turns it into pixels.
 */
import {
  formatChestCm,
  formatHeightCm,
  formatShoeSizeEu,
  formatWaistCm,
} from "../utils/fit-metrics";
import type { BodyBounds } from "./body-bounds";

export interface MeasurementStats {
  heightCm: number | null;
  chestCm: number | null;
  waistCm: number | null;
  shoeSizeEu: number | null;
  /** Kids have a height and a shoe size on the avatar, nothing else. */
  kids: boolean;
}

export interface HeightMark {
  /** Horizontal position of the arrow, left of the body. */
  x: number;
  top: number;
  bottom: number;
  label: string;
}

export interface GirthMark {
  y: number;
  left: number;
  right: number;
  /** "Chest 105 cm" */
  label: string;
}

export interface ShoeMark {
  /** The edge of the nearest shoe the chip sits beside, and which side it is on. */
  x: number;
  y: number;
  side: "left" | "right";
  label: string;
}

export interface MeasurementMarks {
  height?: HeightMark;
  chest?: GirthMark;
  waist?: GirthMark;
  shoe?: ShoeMark;
}

/** Where on a standing body (0 = top of the head, 1 = soles of the feet) the chest and waist
 *  lines sit. Standard figure proportions: the chest line runs across the bust, the waist at
 *  the navel. They are guides, like the diagram on a size chart. */
export const CHEST_AT = 0.27;
export const WAIST_AT = 0.41;

/** The detected row is arm to arm; the chest and waist lines run across the torso. */
const TORSO_SHARE = 0.72;
/** A middle run narrower than this share of the row means the arms are clear of the torso. */
const ARMS_CLEAR_SHARE = 0.85;
/** Share of the picture width the shoe chip needs beside the feet. */
const SHOE_CHIP_ROOM = 0.18;
/** Gap between the body and the height arrow, as a share of the picture width. */
const HEIGHT_ARROW_GAP = 0.1;

export function computeMeasurementMarks(stats: MeasurementStats, bounds: BodyBounds): MeasurementMarks {
  const marks: MeasurementMarks = {};
  const span = bounds.bottom - bounds.top;
  if (span <= 0) return marks;

  if (stats.heightCm !== null && Number.isFinite(stats.heightCm) && stats.heightCm > 0) {
    marks.height = {
      x: Math.max(0.04, bounds.leftmost - HEIGHT_ARROW_GAP),
      top: bounds.top,
      bottom: bounds.bottom,
      label: formatHeightCm(stats.heightCm, stats.kids),
    };
  }

  if (!stats.kids) {
    const girth = (at: number, label: string): GirthMark | undefined => {
      const y = bounds.top + span * at;
      const extent = bounds.extentAt(y);
      if (!extent) return undefined;
      const torso = bounds.torsoAt(y) ?? extent;
      const torsoWidth = torso.right - torso.left;
      const extentWidth = extent.right - extent.left;
      const centre = (torso.left + torso.right) / 2;
      // Arms hanging clear of the body leave the torso on its own: measure that, edge to edge.
      // Arms touching it can't be told apart, so take the usual torso share of the full row.
      const half = (torsoWidth < extentWidth * ARMS_CLEAR_SHARE ? torsoWidth : extentWidth * TORSO_SHARE) / 2;
      return { y, left: centre - half, right: centre + half, label };
    };

    const chest = formatChestCm(stats.chestCm);
    if (chest !== "—") marks.chest = girth(CHEST_AT, `Chest ${chest}`);

    const waist = formatWaistCm(stats.waistCm);
    if (waist !== "—") marks.waist = girth(WAIST_AT, `Waist ${waist}`);
  }

  const shoe = formatShoeSizeEu(stats.shoeSizeEu, stats.kids);
  if (shoe !== "—") {
    const y = bounds.bottom - span * 0.03;
    const feet = bounds.extentAt(y);
    if (feet) {
      // The chip goes on the right of the feet (the left holds the height arrow), unless
      // there is no room for it there.
      const side = 1 - feet.right >= SHOE_CHIP_ROOM ? "right" : "left";
      marks.shoe = { x: side === "right" ? feet.right : feet.left, y, side, label: `Shoe ${shoe}` };
    }
  }

  return marks;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where a picture of the given aspect ratio (width / height) lands inside a box, for CSS
 * `object-fit: contain | cover` with an `object-position` of (posX, posY) in 0-1.
 */
export function fitImageRect(
  boxWidth: number,
  boxHeight: number,
  imageAspect: number,
  mode: "contain" | "cover",
  posX = 0.5,
  posY = 0.5
): Rect {
  const scale =
    mode === "cover"
      ? Math.max(boxWidth / imageAspect, boxHeight)
      : Math.min(boxWidth / imageAspect, boxHeight);
  const w = imageAspect * scale;
  const h = scale;
  return { x: (boxWidth - w) * posX, y: (boxHeight - h) * posY, w, h };
}
