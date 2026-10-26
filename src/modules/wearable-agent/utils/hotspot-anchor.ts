/**
 * Where a garment's tap dot goes on the avatar, worked out from where the body really is in the
 * picture (see `lib/body-bounds.ts`) instead of a fixed percentage. A fixed spot only suits one
 * framing: on a photo that is zoomed, cropped or posed differently the pants dot ended up in the
 * gap between the legs and the shirt dot on the collar.
 *
 * Pure: takes the detected body, returns fractions of the picture (0-1).
 */
import type { BodyBounds } from "../lib/body-bounds";
import type { GarmentCategory } from "./fit-metrics";

/** How far down a standing body (0 = top of the head, 1 = soles) each garment's dot sits: the
 *  middle of the fabric, not its edge. */
const ANCHOR_AT: Record<GarmentCategory, number> = {
  top: 0.31,
  outerwear: 0.31,
  dress: 0.42,
  bottom: 0.58,
  shoes: 0.97,
  other: 0.45,
};

/** Garments that sit on one leg or foot get their dot on the shopper's right one (left on the
 *  screen), a quarter of the way in from the body's outer edge: on the cloth, never in the gap. */
const ON_LEG: ReadonlySet<GarmentCategory> = new Set(["bottom", "shoes"]);
const LEG_SHARE = 0.25;

/** Extra drop for a second garment of the same kind, so two tops don't share one dot. */
const STAGGER = 0.04;

export interface HotspotAnchor {
  /** Fraction of the picture height / width. */
  top: number;
  left: number;
}

export function bodyHotspotAnchor(
  slot: GarmentCategory,
  bounds: BodyBounds,
  stagger = 0
): HotspotAnchor | null {
  const span = bounds.bottom - bounds.top;
  if (span <= 0) return null;

  const y = bounds.top + span * (ANCHOR_AT[slot] + stagger * STAGGER);
  const extent = bounds.extentAt(y);
  if (!extent) return null;

  let left: number;
  if (ON_LEG.has(slot)) {
    left = extent.left + (extent.right - extent.left) * LEG_SHARE;
  } else {
    const torso = bounds.torsoAt(y) ?? extent;
    left = (torso.left + torso.right) / 2;
  }

  return { top: Math.min(0.98, Math.max(0.02, y)), left: Math.min(0.98, Math.max(0.02, left)) };
}
