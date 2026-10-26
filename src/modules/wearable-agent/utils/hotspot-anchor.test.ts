import { describe, expect, it } from "vitest";
import type { BodyBounds } from "../lib/body-bounds";
import { bodyHotspotAnchor } from "./hotspot-anchor";

/** A figure from 10% to 90% of the picture, arms to arm 30-70%, torso 38-62%. */
const body: BodyBounds = {
  top: 0.1,
  bottom: 0.9,
  leftmost: 0.3,
  rightmost: 0.7,
  extentAt: () => ({ left: 0.3, right: 0.7 }),
  torsoAt: () => ({ left: 0.38, right: 0.62 }),
};

describe("bodyHotspotAnchor", () => {
  it("puts a top on the chest, in the middle of the torso", () => {
    const spot = bodyHotspotAnchor("top", body)!;
    expect(spot.left).toBeCloseTo(0.5);
    expect(spot.top).toBeCloseTo(0.1 + 0.8 * 0.31);
  });

  it("puts a jacket on the shoulder: higher than a top, and off the centre line", () => {
    const jacket = bodyHotspotAnchor("outerwear", body)!;
    const top = bodyHotspotAnchor("top", body)!;
    expect(jacket.top).toBeCloseTo(0.1 + 0.8 * 0.21);
    expect(jacket.top).toBeLessThan(top.top);
    expect(jacket.left).toBeCloseTo(0.38);
    expect(jacket.left).toBeLessThan(0.5);
    // Only the jacket moved: a top is still on the middle of the chest.
    expect(top.left).toBeCloseTo(0.5);
  });

  it("puts pants on the thigh of one leg, not in the gap between them", () => {
    const spot = bodyHotspotAnchor("bottom", body)!;
    expect(spot.left).toBeCloseTo(0.4);
    expect(spot.left).toBeLessThan(0.5);
    expect(spot.top).toBeGreaterThan(bodyHotspotAnchor("top", body)!.top);
  });

  it("puts shoes near the soles", () => {
    expect(bodyHotspotAnchor("shoes", body)!.top).toBeGreaterThan(0.85);
  });

  it("drops a second garment of the same kind a little lower", () => {
    expect(bodyHotspotAnchor("top", body, 1)!.top).toBeGreaterThan(bodyHotspotAnchor("top", body, 0)!.top);
  });

  it("gives up when the body has no extent on that row", () => {
    expect(bodyHotspotAnchor("top", { ...body, extentAt: () => null })).toBeNull();
  });
});
