import { describe, expect, it } from "vitest";
import { findBodyBounds } from "./body-bounds";

const W = 120;
const H = 160;

type Rgba = [number, number, number, number];
type Rect = { x0: number; x1: number; y0: number; y1: number };

/** A simple standing figure: head, torso with arms, legs. Rows are in pixels of the 120x160 scan. */
const FIGURE: Rect[] = [
  { x0: 52, x1: 68, y0: 14, y1: 30 }, // head
  { x0: 36, x1: 84, y0: 30, y1: 90 }, // torso and arms
  { x0: 46, x1: 74, y0: 90, y1: 150 }, // legs
];

function render(background: (x: number, y: number) => Rgba, person: Rgba | null, rects = FIGURE) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inFigure = person && rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
      const [r, g, b, a] = inFigure ? person : background(x, y);
      const i = (y * W + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return data;
}

const solid = (c: [number, number, number]) => (): Rgba => [...c, 255];

describe("findBodyBounds", () => {
  it("finds the top of the head, the feet and the arm-to-arm extent on a solid backdrop", () => {
    const bounds = findBodyBounds(render(solid([214, 64, 159]), [60, 70, 90, 255]), W, H);
    expect(bounds).not.toBeNull();
    expect(bounds!.top).toBeCloseTo(14 / H, 1);
    expect(bounds!.bottom).toBeCloseTo(150 / H, 1);
    expect(bounds!.leftmost).toBeCloseTo(36 / W, 1);
    expect(bounds!.rightmost).toBeCloseTo(84 / W, 1);
    const chest = bounds!.extentAt(50 / H)!;
    expect(chest.left).toBeCloseTo(36 / W, 1);
    expect(chest.right).toBeCloseTo(84 / W, 1);
    const feet = bounds!.extentAt(140 / H)!;
    expect(feet.left).toBeCloseTo(46 / W, 1);
    expect(feet.right).toBeCloseTo(74 / W, 1);
  });

  it("ignores a lighting gradient and a vignette on the backdrop", () => {
    // Brightens down the picture and darkens toward the sides, like the studio plates.
    const lit = (x: number, y: number): Rgba => {
      const vertical = (y / H) * 30;
      const side = Math.abs(x - W / 2) / (W / 2);
      const v = 150 + vertical - side * 25;
      return [v, v - 5, v - 10, 255];
    };
    const bounds = findBodyBounds(render(lit, [40, 60, 110, 255]), W, H);
    expect(bounds).not.toBeNull();
    expect(bounds!.top).toBeCloseTo(14 / H, 1);
    expect(bounds!.bottom).toBeCloseTo(150 / H, 1);
    expect(bounds!.leftmost).toBeCloseTo(36 / W, 1);
  });

  it("still finds a body whose clothes are close in colour to the backdrop", () => {
    // Grey tee on sage: the inside of the shirt hardly differs, but its outline does.
    const bounds = findBodyBounds(render(solid([150, 183, 134]), [150, 150, 150, 255]), W, H);
    expect(bounds).not.toBeNull();
    expect(bounds!.extentAt(50 / H)!.left).toBeCloseTo(36 / W, 1);
    expect(bounds!.extentAt(50 / H)!.right).toBeCloseTo(84 / W, 1);
  });

  it("uses transparency for a cut-out avatar", () => {
    const bounds = findBodyBounds(render(() => [0, 0, 0, 0], [120, 120, 120, 255]), W, H);
    expect(bounds).not.toBeNull();
    expect(bounds!.top).toBeCloseTo(14 / H, 1);
    expect(bounds!.bottom).toBeCloseTo(150 / H, 1);
  });

  it("finds the torso on its own on a cut-out whose arms hang clear of the body", () => {
    const clearArms: Rect[] = [
      { x0: 52, x1: 68, y0: 14, y1: 30 }, // head
      { x0: 46, x1: 74, y0: 30, y1: 90 }, // torso
      { x0: 36, x1: 42, y0: 30, y1: 85 }, // left arm
      { x0: 78, x1: 84, y0: 30, y1: 85 }, // right arm
      { x0: 46, x1: 74, y0: 90, y1: 150 }, // legs
    ];
    const bounds = findBodyBounds(render(() => [0, 0, 0, 0], [120, 120, 120, 255], clearArms), W, H);
    expect(bounds!.extentAt(60 / H)).toEqual({ left: 36 / W, right: 84 / W });
    expect(bounds!.torsoAt(60 / H)).toEqual({ left: 46 / W, right: 74 / W });
  });

  it("returns null for an empty backdrop", () => {
    expect(findBodyBounds(render(solid([200, 200, 200]), null), W, H)).toBeNull();
  });

  it("returns null when the shape is too small to be a standing person", () => {
    const small: Rect[] = [{ x0: 50, x1: 70, y0: 70, y1: 90 }];
    expect(findBodyBounds(render(solid([200, 200, 200]), [20, 20, 20, 255], small), W, H)).toBeNull();
  });

  it("returns null for a picture too small to scan", () => {
    expect(findBodyBounds(new Uint8ClampedArray(8 * 8 * 4), 8, 8)).toBeNull();
  });
});
