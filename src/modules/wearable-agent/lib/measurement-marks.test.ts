import { describe, expect, it } from "vitest";
import type { BodyBounds } from "./body-bounds";
import { CHEST_AT, WAIST_AT, computeMeasurementMarks, fitImageRect } from "./measurement-marks";

/** Person from 10% to 90% of the height, arms at 30%-70% of the width, shoes at 40%-60%. */
const BOUNDS: BodyBounds = {
  top: 0.1,
  bottom: 0.9,
  leftmost: 0.3,
  rightmost: 0.7,
  extentAt: (y) => (y > 0.85 ? { left: 0.4, right: 0.6 } : { left: 0.3, right: 0.7 }),
};

const ADULT = { heightCm: 190, chestCm: 105, waistCm: 92, shoeSizeEu: 44, kids: false };

describe("computeMeasurementMarks", () => {
  it("gives an adult a height arrow, chest and waist lines and a shoe chip", () => {
    const marks = computeMeasurementMarks(ADULT, BOUNDS);
    expect(marks.height).toMatchObject({ top: 0.1, bottom: 0.9, label: "190 cm" });
    expect(marks.height!.x).toBeLessThan(BOUNDS.leftmost);
    expect(marks.chest?.label).toBe("Chest 105 cm");
    expect(marks.waist?.label).toBe("Waist 92 cm");
    expect(marks.shoe?.label).toBe("Shoe EU 44");
  });

  it("puts the chest and waist lines at their share of the body height, across the torso", () => {
    const marks = computeMeasurementMarks(ADULT, BOUNDS);
    expect(marks.chest!.y).toBeCloseTo(0.1 + 0.8 * CHEST_AT, 5);
    expect(marks.waist!.y).toBeCloseTo(0.1 + 0.8 * WAIST_AT, 5);
    expect(marks.waist!.y).toBeGreaterThan(marks.chest!.y);
    // Narrower than arm to arm, and centred.
    expect(marks.chest!.right - marks.chest!.left).toBeLessThan(0.4);
    expect((marks.chest!.left + marks.chest!.right) / 2).toBeCloseTo(0.5, 5);
  });

  it("gives a kid only the height arrow and the shoe chip", () => {
    const marks = computeMeasurementMarks({ ...ADULT, heightCm: 120, shoeSizeEu: 31, kids: true }, BOUNDS);
    expect(marks.height?.label).toBe("120 cm");
    expect(marks.shoe?.label).toBe("Shoe EU 31");
    expect(marks.chest).toBeUndefined();
    expect(marks.waist).toBeUndefined();
  });

  it("skips values the shopper has not given", () => {
    const marks = computeMeasurementMarks(
      { heightCm: null, chestCm: null, waistCm: 92, shoeSizeEu: null, kids: false },
      BOUNDS
    );
    expect(marks.height).toBeUndefined();
    expect(marks.chest).toBeUndefined();
    expect(marks.shoe).toBeUndefined();
    expect(marks.waist?.label).toBe("Waist 92 cm");
  });

  it("keeps the height arrow inside the picture", () => {
    const marks = computeMeasurementMarks(ADULT, { ...BOUNDS, leftmost: 0.02 });
    expect(marks.height!.x).toBeGreaterThanOrEqual(0.04);
  });

  it("puts the shoe chip on the right of the feet, or on the left when the right has no room", () => {
    const left = computeMeasurementMarks(ADULT, { ...BOUNDS, extentAt: () => ({ left: 0.1, right: 0.45 }) });
    expect(left.shoe?.side).toBe("right");
    const right = computeMeasurementMarks(ADULT, { ...BOUNDS, extentAt: () => ({ left: 0.55, right: 0.95 }) });
    expect(right.shoe?.side).toBe("left");
  });
});

describe("fitImageRect", () => {
  it("fills a box of the same shape exactly", () => {
    expect(fitImageRect(300, 400, 3 / 4, "cover")).toEqual({ x: 0, y: 0, w: 300, h: 400 });
    expect(fitImageRect(300, 400, 3 / 4, "contain")).toEqual({ x: 0, y: 0, w: 300, h: 400 });
  });

  it("letterboxes with contain", () => {
    const r = fitImageRect(400, 400, 3 / 4, "contain");
    expect(r.h).toBe(400);
    expect(r.w).toBe(300);
    expect(r.x).toBe(50);
    expect(r.y).toBeCloseTo(0, 5);
  });

  it("crops with cover and honours the vertical position", () => {
    const top = fitImageRect(300, 300, 3 / 4, "cover", 0.5, 0);
    expect(top.w).toBe(300);
    expect(top.h).toBe(400);
    expect(top.y).toBeCloseTo(0, 5);
    const anchored = fitImageRect(300, 300, 3 / 4, "cover", 0.5, 0.15);
    expect(anchored.y).toBeCloseTo(-15, 5);
  });
});
