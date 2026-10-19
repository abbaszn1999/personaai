/**
 * Layout rules for the tap dots on the avatar. Where a garment sits on the body is a fixed
 * guess, so a jacket over a tee puts two dots a few pixels apart and the later one swallows
 * every tap. Nothing here assumes which garments there are or what gender wears them: it only
 * works with where the dots ended up, so any outfit gets dots a thumb can tell apart.
 */

/** A dot's tap target is 44px (the platform minimum); dots are kept at least that far apart so
 *  no two targets overlap. */
export const HOTSPOT_MIN_GAP = 44;

/**
 * Spreads dots out vertically until every neighbour is at least `gap` apart. Dots that are too
 * close form a group, which is laid out evenly around its own centre so no dot strays far from
 * the garment it marks, then the whole set is kept inside `[min, max]`.
 * Takes and returns pixel positions in the same order.
 */
export function spreadHotspots(positions: readonly number[], gap: number, min: number, max: number): number[] {
  const order = positions.map((_, i) => i).sort((a, b) => positions[a] - positions[b] || a - b);
  let ys = order.map((i) => positions[i]);

  // A spread can push a group into the next one, which then has to join it: repeat until nothing
  // overlaps. Groups only ever merge, so this settles in at most one pass per dot.
  for (let pass = 0; pass < ys.length; pass += 1) {
    const groups: number[][] = [];
    ys.forEach((y, i) => {
      const last = groups[groups.length - 1];
      if (last && y - ys[last[last.length - 1]] < gap - 0.5) last.push(i);
      else groups.push([i]);
    });
    if (groups.every((g) => g.length === 1)) break;
    const next = [...ys];
    for (const group of groups) {
      if (group.length === 1) continue;
      const centre = group.reduce((sum, i) => sum + ys[i], 0) / group.length;
      const start = centre - ((group.length - 1) * gap) / 2;
      group.forEach((i, k) => {
        next[i] = start + k * gap;
      });
    }
    ys = next;
  }

  // Keep inside the frame without breaking the spacing: push down from the top edge, then back
  // up from the bottom edge.
  for (let i = 0; i < ys.length; i += 1) {
    ys[i] = Math.max(ys[i], i === 0 ? min : ys[i - 1] + gap);
  }
  for (let i = ys.length - 1; i >= 0; i -= 1) {
    ys[i] = Math.min(ys[i], i === ys.length - 1 ? max : ys[i + 1] - gap);
  }

  const result = new Array<number>(positions.length);
  order.forEach((original, sortedIndex) => {
    result[original] = ys[sortedIndex];
  });
  return result;
}

export interface Point {
  x: number;
  y: number;
}

export interface CardPlacementInput {
  /** The dot the card belongs to. */
  anchor: Point;
  /** The other dots, which the card should not cover. */
  others: readonly Point[];
  card: { width: number; height: number };
  frame: { width: number; height: number };
  /** Space kept between the dot and the card, and between the card and the frame's edge. */
  gap: number;
  edge: number;
}

/** Half the side of a dot's tap target; the dot the card belongs to only needs its own visible
 *  marker kept clear. */
const OTHER_HALF = HOTSPOT_MIN_GAP / 2;
const SELF_HALF = 14;

/**
 * Where the top-left of an open card goes, in the frame's pixels. Tries the card beside the dot
 * (either side), centred on it, and in every free slot above and below each dot, and keeps the
 * spot that covers the fewest dots — then the one nearest the dot. When nothing is free (a
 * narrow phone frame full of dots) it still returns the least bad spot rather than failing.
 */
export function placeHotspotCard({ anchor, others, card, frame, gap, edge }: CardPlacementInput): Point {
  const clampX = (x: number) => Math.max(edge, Math.min(frame.width - edge - card.width, x));
  const clampY = (y: number) => Math.max(edge, Math.min(frame.height - edge - card.height, y));

  const xs = [anchor.x + gap, anchor.x - gap - card.width, anchor.x - card.width / 2].map(clampX);
  const ys = [anchor.y - card.height / 2];
  for (const point of [anchor, ...others]) {
    const half = point === anchor ? SELF_HALF : OTHER_HALF;
    ys.push(point.y + half + gap * 0.5, point.y - half - gap * 0.5 - card.height);
  }

  const covered = (left: number, top: number, point: Point, half: number) =>
    point.x + half > left && point.x - half < left + card.width && point.y + half > top && point.y - half < top + card.height;

  let best: { left: number; top: number; hits: number; distance: number } | null = null;
  for (const x of xs) {
    for (const rawY of ys) {
      const y = clampY(rawY);
      let hits = covered(x, y, anchor, SELF_HALF) ? 2 : 0;
      for (const other of others) if (covered(x, y, other, OTHER_HALF)) hits += 1;
      // How far the card's nearest edge is from the dot: a card hugging the dot beats one that
      // merely has its centre close.
      const distance = Math.hypot(
        Math.max(x - anchor.x, 0, anchor.x - (x + card.width)),
        Math.max(y - anchor.y, 0, anchor.y - (y + card.height))
      );
      if (!best || hits < best.hits || (hits === best.hits && distance < best.distance)) {
        best = { left: x, top: y, hits, distance };
      }
    }
  }
  return { x: best?.left ?? edge, y: best?.top ?? edge };
}
