import { describe, expect, it } from "vitest";
import { nearestIndex, neighbourIndex } from "./paged-carousel";

describe("nearestIndex", () => {
  it("picks the page whose centre is closest to the view centre", () => {
    expect(nearestIndex([180, 560, 940], 200)).toBe(0);
    expect(nearestIndex([-180, 200, 580], 190)).toBe(1);
  });

  it("returns -1 when there are no pages", () => {
    expect(nearestIndex([], 100)).toBe(-1);
  });
});

describe("neighbourIndex", () => {
  const centers = [200, 580, 960];

  it("steps to the next page on screen in each direction", () => {
    expect(neighbourIndex(centers, 1, 1)).toBe(2);
    expect(neighbourIndex(centers, 1, -1)).toBe(0);
  });

  it("is null at either end", () => {
    expect(neighbourIndex(centers, 0, -1)).toBeNull();
    expect(neighbourIndex(centers, 2, 1)).toBeNull();
  });

  it("follows the physical direction, so a right-to-left layout needs no special case", () => {
    const rtl = [960, 580, 200];
    expect(neighbourIndex(rtl, 0, -1)).toBe(1);
    expect(neighbourIndex(rtl, 0, 1)).toBeNull();
  });

  it("is null for an index that is not a page", () => {
    expect(neighbourIndex(centers, -1, 1)).toBeNull();
  });
});
