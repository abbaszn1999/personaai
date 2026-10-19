import { describe, expect, it } from "vitest";
import { HOTSPOT_MIN_GAP, placeHotspotCard, spreadHotspots } from "./hotspot-layout";

const gaps = (ys: number[]) => {
  const sorted = [...ys].sort((a, b) => a - b);
  return sorted.slice(1).map((y, i) => y - sorted[i]);
};

describe("spreadHotspots", () => {
  it("leaves dots that are already apart where they are", () => {
    expect(spreadHotspots([80, 200, 380], HOTSPOT_MIN_GAP, 10, 430)).toEqual([80, 200, 380]);
  });

  it("separates a jacket and a tee a few pixels apart, around their shared centre", () => {
    const [tee, jacket] = spreadHotspots([100, 116], HOTSPOT_MIN_GAP, 10, 430);
    expect(jacket - tee).toBeGreaterThanOrEqual(HOTSPOT_MIN_GAP);
    expect((tee + jacket) / 2).toBeCloseTo(108, 0);
  });

  it("keeps the input order", () => {
    const [a, b] = spreadHotspots([116, 100], HOTSPOT_MIN_GAP, 10, 430);
    expect(a).toBeGreaterThan(b);
  });

  it("merges into a neighbouring group when spreading closes the gap to it", () => {
    const out = spreadHotspots([100, 110, 120, 170], HOTSPOT_MIN_GAP, 10, 430);
    gaps(out).forEach((g) => expect(g).toBeGreaterThanOrEqual(HOTSPOT_MIN_GAP - 1));
  });

  it("stays inside the frame at the top and at the bottom", () => {
    const top = spreadHotspots([12, 20, 28], HOTSPOT_MIN_GAP, 10, 430);
    expect(Math.min(...top)).toBeGreaterThanOrEqual(10);
    gaps(top).forEach((g) => expect(g).toBeGreaterThanOrEqual(HOTSPOT_MIN_GAP - 1));
    const bottom = spreadHotspots([410, 420, 428], HOTSPOT_MIN_GAP, 10, 430);
    expect(Math.max(...bottom)).toBeLessThanOrEqual(430);
    gaps(bottom).forEach((g) => expect(g).toBeGreaterThanOrEqual(HOTSPOT_MIN_GAP - 1));
  });

  it("handles one dot, and none", () => {
    expect(spreadHotspots([50], HOTSPOT_MIN_GAP, 10, 430)).toEqual([50]);
    expect(spreadHotspots([], HOTSPOT_MIN_GAP, 10, 430)).toEqual([]);
  });

  it("copes with a full rack of dots at the same height", () => {
    const out = spreadHotspots([150, 150, 150, 150, 150, 150], HOTSPOT_MIN_GAP, 10, 430);
    gaps(out).forEach((g) => expect(g).toBeGreaterThanOrEqual(HOTSPOT_MIN_GAP - 1));
    expect(Math.min(...out)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...out)).toBeLessThanOrEqual(430);
  });
});

describe("placeHotspotCard", () => {
  const card = { width: 208, height: 110 };
  const covers = (spot: { x: number; y: number }, p: { x: number; y: number }, half = 22) =>
    p.x + half > spot.x && p.x - half < spot.x + card.width && p.y + half > spot.y && p.y - half < spot.y + card.height;

  it("puts the card beside the dot when there is room", () => {
    const spot = placeHotspotCard({
      anchor: { x: 60, y: 200 },
      others: [],
      card,
      frame: { width: 500, height: 440 },
      gap: 14,
      edge: 10,
    });
    expect(spot.x).toBe(74);
  });

  it("keeps a wide frame's neighbouring dots uncovered", () => {
    const anchor = { x: 250, y: 150 };
    const others = [{ x: 250, y: 106 }, { x: 250, y: 330 }];
    const spot = placeHotspotCard({ anchor, others, card, frame: { width: 520, height: 520 }, gap: 14, edge: 10 });
    others.forEach((o) => expect(covers(spot, o)).toBe(false));
    expect(covers(spot, anchor, 14)).toBe(false);
  });

  it("never covers the dot it belongs to on a narrow phone frame", () => {
    const anchor = { x: 152, y: 130 };
    const others = [{ x: 152, y: 86 }, { x: 160, y: 250 }, { x: 156, y: 400 }];
    const spot = placeHotspotCard({ anchor, others, card, frame: { width: 330, height: 440 }, gap: 14, edge: 10 });
    expect(covers(spot, anchor, 14)).toBe(false);
    expect(spot.x).toBeGreaterThanOrEqual(10);
    expect(spot.x + card.width).toBeLessThanOrEqual(320);
    expect(spot.y).toBeGreaterThanOrEqual(10);
    expect(spot.y + card.height).toBeLessThanOrEqual(430);
  });
});
