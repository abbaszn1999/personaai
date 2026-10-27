import { describe, expect, it } from "vitest";
import type { Product } from "@/modules/commerce/types";
import { LIVE_TRYON_PROMPT, lookUsageName } from "./live-tryon-prompt";
import { sessionSeconds } from "./live-session-seconds";
import {
  REFERENCE_IMAGE_MAX_BYTES,
  fitWithin,
  hasTranslucentPixels,
  needsPreparation,
} from "./reference-image";

let counter = 0;
const product = (name: string): Product =>
  ({ id: `p${++counter}`, name, description: "", imageUrl: "https://example.com/a.jpg" }) as Product;

describe("LIVE_TRYON_PROMPT", () => {
  it("asks for one thing: wear the outfit in the reference image", () => {
    expect(LIVE_TRYON_PROMPT.startsWith("Substitute the outfit with")).toBe(true);
    expect(LIVE_TRYON_PROMPT.match(/Substitute|Add /g)).toHaveLength(1);
    expect(LIVE_TRYON_PROMPT).not.toMatch(/preserve|identity|pose|background/i);
  });

  it("stays under Decart's roughly 750 character limit", () => {
    expect(LIVE_TRYON_PROMPT.length).toBeLessThan(750);
  });
});

describe("lookUsageName", () => {
  it("lists the items and stays a sane length", () => {
    expect(lookUsageName([product("Hoodie"), product("Chinos")])).toBe("Look: Hoodie, Chinos");
    expect(lookUsageName([])).toBe("Look");
    expect(lookUsageName(Array.from({ length: 60 }, () => product("A Very Long Garment Name"))).length).toBeLessThanOrEqual(200);
  });
});

describe("sessionSeconds", () => {
  it("adds the seconds carried over from earlier connections", () => {
    expect(sessionSeconds(0, 25)).toBe(25);
    expect(sessionSeconds(60, 20)).toBe(80);
  });

  it("does not lose time when the tick restarts after a camera flip", () => {
    const beforeFlip = sessionSeconds(0, 60);
    const afterFlip = sessionSeconds(beforeFlip, 0);
    expect(afterFlip).toBe(60);
    expect(sessionSeconds(beforeFlip, 30)).toBe(90);
  });

  it("ignores junk input", () => {
    expect(sessionSeconds(Number.NaN, 10)).toBe(10);
    expect(sessionSeconds(-5, 10)).toBe(10);
    expect(sessionSeconds(10, Number.NaN)).toBe(10);
  });
});

describe("reference image preparation", () => {
  it("scales a large picture down to 2048 px and never scales one up", () => {
    expect(fitWithin(4096, 2048)).toEqual({ width: 2048, height: 1024, scaled: true });
    expect(fitWithin(1500, 3000)).toEqual({ width: 1024, height: 2048, scaled: true });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600, scaled: false });
    expect(fitWithin(2048, 2048).scaled).toBe(false);
  });

  it("leaves an in-spec picture alone and flags the rest", () => {
    const ok = { type: "image/jpeg", size: 400_000, width: 1200, height: 1600 };
    expect(needsPreparation(ok)).toBe(false);
    expect(needsPreparation({ ...ok, type: "image/png" })).toBe(false);
    expect(needsPreparation({ ...ok, type: "image/webp" })).toBe(false);
    expect(needsPreparation({ ...ok, type: "image/avif" })).toBe(true);
    expect(needsPreparation({ ...ok, type: "image/gif" })).toBe(true);
    expect(needsPreparation({ ...ok, size: REFERENCE_IMAGE_MAX_BYTES + 1 })).toBe(true);
    expect(needsPreparation({ ...ok, width: 3000 })).toBe(true);
  });

  it("flattens a transparent cut-out even when it is otherwise in spec", () => {
    const ok = { type: "image/png", size: 400_000, width: 1200, height: 1600 };
    expect(needsPreparation({ ...ok, transparent: true })).toBe(true);
    expect(needsPreparation({ ...ok, transparent: false })).toBe(false);
  });

  it("detects see-through pixels", () => {
    const opaque = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    const cutout = new Uint8ClampedArray([10, 20, 30, 255, 0, 0, 0, 0]);
    expect(hasTranslucentPixels(opaque)).toBe(false);
    expect(hasTranslucentPixels(cutout)).toBe(true);
  });
});
