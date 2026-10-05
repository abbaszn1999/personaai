import type { TryOnAudience, TryOnProfile } from "../types";

/** The adult ranges the onboarding form accepts for height and weight. Outside them there is
 *  nothing sensible to estimate from (a typo, or a half-typed number), so no estimate is made. */
const MIN_HEIGHT_CM = 120;
const MAX_HEIGHT_CM = 220;
const MIN_WEIGHT_KG = 30;
const MAX_WEIGHT_KG = 180;

/** Clamp the result to the same realistic bounds the Model Stats card displays. */
const MIN_CHEST_CM = 60;
const MAX_CHEST_CM = 160;
const MIN_WAIST_CM = 50;
const MAX_WAIST_CM = 150;

export interface BodyEstimate {
  chestCm: number;
  waistCm: number;
}

/** cm = intercept + bmi * BMI + height * heightCm. */
interface Line {
  intercept: number;
  bmi: number;
  height: number;
}

interface Model {
  chest: Line;
  waist: Line;
}

// Least-squares fits of chest and waist circumference on BMI and height, one per sex, to the
// public ANSUR II survey (US Army, 2012: 4,082 men and 1,986 women, adults). Refit with
// `scripts/fit-body-estimate.mjs`. On a held-out 20% the mean absolute error is 2.5 cm (men) and
// 3.4 cm (women) for chest, and 3.5 cm / 3.7 cm for waist; 89% / 75% of chests and 76% / 70% of
// waists land within 5 cm. That is roughly the ceiling for an estimate from height and weight alone.
//
// What the data measures, which is not always what a size chart means:
//  - chest is the circumference at the nipples (men) or bust point (women), as charts use it;
//  - waist is taken at the navel, not the narrowest "natural" waist, so it reads a few cm
//    larger than a women's top or dress chart's waist, and is closer to where trousers sit;
//  - the sample is serving soldiers, leaner and more muscular than the general public on
//    average (mean BMI 27.7 men, 25.5 women, so the fit is best across the 20-35 range).
const MEN: Model = {
  chest: { intercept: -2.9063, bmi: 1.9425, height: 0.3131 },
  waist: { intercept: -33.5248, bmi: 2.4787, height: 0.3357 },
};
const WOMEN: Model = {
  chest: { intercept: 0.0098, bmi: 1.9426, height: 0.2772 },
  waist: { intercept: -22.1893, bmi: 2.4238, height: 0.2854 },
};

function evaluate(line: Line, heightCm: number, bmi: number): number {
  return line.intercept + line.bmi * bmi + line.height * heightCm;
}

function apply(model: Model, heightCm: number, bmi: number): { chest: number; waist: number } {
  return { chest: evaluate(model.chest, heightCm, bmi), waist: evaluate(model.waist, heightCm, bmi) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Approximate chest and waist (cm) from height and weight, for shoppers who do not know theirs.
 *
 * Women and men use their own curves; unisex (and an unanswered audience) uses the midpoint of the
 * two. Returns null when height or weight is missing or outside the adult range — typically a
 * half-typed number — so callers never fill a field from garbage.
 */
export function estimateChestWaist(input: {
  heightCm: number | null;
  weightKg: number | null;
  audience: TryOnAudience | null;
}): BodyEstimate | null {
  const { heightCm, weightKg, audience } = input;
  if (heightCm === null || weightKg === null) return null;
  if (!Number.isFinite(heightCm) || !Number.isFinite(weightKg)) return null;
  if (heightCm < MIN_HEIGHT_CM || heightCm > MAX_HEIGHT_CM) return null;
  if (weightKg < MIN_WEIGHT_KG || weightKg > MAX_WEIGHT_KG) return null;

  const bmi = weightKg / (heightCm / 100) ** 2;
  const men = apply(MEN, heightCm, bmi);
  const women = apply(WOMEN, heightCm, bmi);

  const pick =
    audience === "man"
      ? men
      : audience === "woman"
        ? women
        : { chest: (men.chest + women.chest) / 2, waist: (men.waist + women.waist) / 2 };

  return {
    chestCm: Math.round(clamp(pick.chest, MIN_CHEST_CM, MAX_CHEST_CM)),
    waistCm: Math.round(clamp(pick.waist, MIN_WAIST_CM, MAX_WAIST_CM)),
  };
}

/** Which of chest/waist currently hold a value the form filled in (as opposed to one the shopper
 *  typed, or none). Only these may be refreshed when height or weight changes again. */
export interface AutoFilled {
  chestCm: boolean;
  waistCm: boolean;
}

export const NOTHING_AUTO_FILLED: AutoFilled = { chestCm: false, waistCm: false };

/**
 * Applies a height/weight edit and, where allowed, fills chest and waist from the result.
 *
 * A field is filled only when it is empty or was itself filled by an earlier estimate. A value
 * the shopper typed is never replaced  not when they entered it before height and weight, and
 * not when they change height or weight afterwards. Nothing is filled until both height and
 * weight form a plausible adult.
 */
export function applyHeightWeightEdit(
  profile: Pick<TryOnProfile, "heightCm" | "weightKg" | "chestCm" | "waistCm" | "audience">,
  edit: { heightCm?: number | null; weightKg?: number | null },
  autoFilled: AutoFilled,
): { patch: Partial<TryOnProfile>; autoFilled: AutoFilled } {
  const patch: Partial<TryOnProfile> = { ...edit };
  const heightCm = edit.heightCm !== undefined ? edit.heightCm : profile.heightCm;
  const weightKg = edit.weightKg !== undefined ? edit.weightKg : profile.weightKg;
  const estimate = estimateChestWaist({ heightCm, weightKg, audience: profile.audience });
  if (!estimate) return { patch, autoFilled };

  const next = { ...autoFilled };
  for (const field of ["chestCm", "waistCm"] as const) {
    if (profile[field] === null || autoFilled[field]) {
      patch[field] = estimate[field];
      next[field] = true;
    }
  }
  return { patch, autoFilled: next };
}
