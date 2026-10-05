import { describe, expect, it } from "vitest";
import { applyHeightWeightEdit, estimateChestWaist, NOTHING_AUTO_FILLED } from "./body-estimate";

describe("estimateChestWaist", () => {
  it("gives a typical man a typical chest and waist", () => {
    const estimate = estimateChestWaist({ heightCm: 176, weightKg: 74, audience: "man" })!;
    expect(estimate.chestCm).toBeGreaterThanOrEqual(95);
    expect(estimate.chestCm).toBeLessThanOrEqual(101);
    expect(estimate.waistCm).toBeGreaterThanOrEqual(80);
    expect(estimate.waistCm).toBeLessThanOrEqual(88);
  });

  it("gives a typical woman a typical bust and waist", () => {
    const estimate = estimateChestWaist({ heightCm: 163, weightKg: 58, audience: "woman" })!;
    expect(estimate.chestCm).toBeGreaterThanOrEqual(86);
    expect(estimate.chestCm).toBeLessThanOrEqual(94);
    // The survey measured waist at the navel, which reads a few cm above a chart's natural waist.
    expect(estimate.waistCm).toBeGreaterThanOrEqual(74);
    expect(estimate.waistCm).toBeLessThanOrEqual(80);
  });

  it("reproduces the average body of the survey the formulas were fitted to", () => {
    // ANSUR II means: men 175.6 cm / 85.5 kg -> chest 105.9, waist 94.1;
    // women 162.8 cm / 67.8 kg -> chest 94.7, waist 86.1.
    const men = estimateChestWaist({ heightCm: 175.6, weightKg: 85.5, audience: "man" })!;
    expect(Math.abs(men.chestCm - 105.9)).toBeLessThanOrEqual(1);
    expect(Math.abs(men.waistCm - 94.1)).toBeLessThanOrEqual(1);
    const women = estimateChestWaist({ heightCm: 162.8, weightKg: 67.8, audience: "woman" })!;
    expect(Math.abs(women.chestCm - 94.7)).toBeLessThanOrEqual(1);
    expect(Math.abs(women.waistCm - 86.1)).toBeLessThanOrEqual(1);
  });

  it("uses the midpoint of the two for unisex or an unanswered audience", () => {
    const input = { heightCm: 170, weightKg: 68 };
    const man = estimateChestWaist({ ...input, audience: "man" })!;
    const woman = estimateChestWaist({ ...input, audience: "woman" })!;
    const unisex = estimateChestWaist({ ...input, audience: "unisex" })!;
    expect(unisex.chestCm).toBeGreaterThanOrEqual(Math.min(man.chestCm, woman.chestCm));
    expect(unisex.chestCm).toBeLessThanOrEqual(Math.max(man.chestCm, woman.chestCm));
    expect(estimateChestWaist({ ...input, audience: null })).toEqual(unisex);
  });

  it("grows with weight and with height", () => {
    const base = estimateChestWaist({ heightCm: 175, weightKg: 70, audience: "man" })!;
    const heavier = estimateChestWaist({ heightCm: 175, weightKg: 95, audience: "man" })!;
    expect(heavier.chestCm).toBeGreaterThan(base.chestCm);
    expect(heavier.waistCm).toBeGreaterThan(base.waistCm);
  });

  it("returns whole numbers inside the realistic display bounds, even at the extremes", () => {
    for (const [heightCm, weightKg] of [
      [220, 30],
      [120, 180],
      [150, 180],
      [200, 40],
    ]) {
      for (const audience of ["woman", "man", "unisex"] as const) {
        const estimate = estimateChestWaist({ heightCm, weightKg, audience })!;
        expect(Number.isInteger(estimate.chestCm)).toBe(true);
        expect(estimate.chestCm).toBeGreaterThanOrEqual(60);
        expect(estimate.chestCm).toBeLessThanOrEqual(160);
        expect(estimate.waistCm).toBeGreaterThanOrEqual(50);
        expect(estimate.waistCm).toBeLessThanOrEqual(150);
      }
    }
  });

  it("makes no estimate from a missing, half-typed or out-of-range height or weight", () => {
    expect(estimateChestWaist({ heightCm: null, weightKg: 70, audience: "man" })).toBeNull();
    expect(estimateChestWaist({ heightCm: 170, weightKg: null, audience: "man" })).toBeNull();
    expect(estimateChestWaist({ heightCm: 17, weightKg: 70, audience: "man" })).toBeNull();
    expect(estimateChestWaist({ heightCm: 170, weightKg: 7, audience: "man" })).toBeNull();
    expect(estimateChestWaist({ heightCm: 400, weightKg: 70, audience: "man" })).toBeNull();
    expect(estimateChestWaist({ heightCm: Number.NaN, weightKg: 70, audience: "man" })).toBeNull();
  });
});

describe("applyHeightWeightEdit", () => {
  const EMPTY = { heightCm: null, weightKg: null, chestCm: null, waistCm: null, audience: "man" as const };

  it("waits for both height and weight before filling anything", () => {
    const first = applyHeightWeightEdit(EMPTY, { heightCm: 176 }, NOTHING_AUTO_FILLED);
    expect(first.patch).toEqual({ heightCm: 176 });
    expect(first.autoFilled).toEqual(NOTHING_AUTO_FILLED);

    const second = applyHeightWeightEdit({ ...EMPTY, heightCm: 176 }, { weightKg: 74 }, first.autoFilled);
    expect(second.patch.chestCm).toBeGreaterThan(0);
    expect(second.patch.waistCm).toBeGreaterThan(0);
    expect(second.autoFilled).toEqual({ chestCm: true, waistCm: true });
  });

  it("never replaces a chest or waist the shopper entered first", () => {
    const profile = { ...EMPTY, chestCm: 101, heightCm: 176 };
    const { patch, autoFilled } = applyHeightWeightEdit(profile, { weightKg: 74 }, NOTHING_AUTO_FILLED);
    // Not in the patch at all, so the typed 101 stays exactly as it is.
    expect(patch).not.toHaveProperty("chestCm");
    expect(patch.waistCm).toBeGreaterThan(0);
    expect(autoFilled).toEqual({ chestCm: false, waistCm: true });
  });

  it("keeps a typed value even when height or weight change again", () => {
    const profile = { ...EMPTY, heightCm: 176, weightKg: 74, chestCm: 101, waistCm: 80 };
    const { patch } = applyHeightWeightEdit(profile, { weightKg: 110 }, NOTHING_AUTO_FILLED);
    expect(patch).toEqual({ weightKg: 110 });
  });

  it("refreshes values it filled itself when height or weight change", () => {
    const filled = applyHeightWeightEdit({ ...EMPTY, heightCm: 176 }, { weightKg: 70 }, NOTHING_AUTO_FILLED);
    const profile = { ...EMPTY, heightCm: 176, weightKg: 70, chestCm: filled.patch.chestCm!, waistCm: filled.patch.waistCm! };
    const refreshed = applyHeightWeightEdit(profile, { weightKg: 100 }, filled.autoFilled);
    expect(refreshed.patch.chestCm!).toBeGreaterThan(filled.patch.chestCm!);
    expect(refreshed.patch.waistCm!).toBeGreaterThan(filled.patch.waistCm!);
  });

  it("leaves earlier estimates alone while a number is half-typed", () => {
    const profile = { ...EMPTY, heightCm: 176, weightKg: 74, chestCm: 98, waistCm: 84 };
    const { patch } = applyHeightWeightEdit(profile, { heightCm: 17 }, { chestCm: true, waistCm: true });
    expect(patch).toEqual({ heightCm: 17 });
  });
});
