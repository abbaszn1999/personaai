import type { GenerateAvatarVariationsInput } from "./image-generation";

/** Whole years a kids profile may be — mirrors the onboarding form. */
const MAX_KID_AGE_YEARS = 17;

type BodyMeasurements = Pick<
  GenerateAvatarVariationsInput,
  "heightCm" | "weightKg" | "shoeSizeEu" | "chestCm" | "waistCm" | "ageYears"
>;

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Validates the body measurements an avatar request carries.
 *
 * Everyone gives height, weight and shoe size. Adults then give chest and waist; the three kids
 * departments give an age instead (0 is valid — under one year). Whichever set arrives is what is
 * required, so an adult request still cannot skip chest and waist by sending an age.
 */
export function parseAvatarBodyMeasurements(
  raw: Record<string, unknown>,
): { measurements: BodyMeasurements } | { error: string } {
  for (const key of ["heightCm", "weightKg", "shoeSizeEu"] as const) {
    if (!positive(raw[key])) return { error: `Invalid or missing measurement: ${key}` };
  }
  const heightCm = raw.heightCm as number;
  const weightKg = raw.weightKg as number;
  const shoeSizeEu = raw.shoeSizeEu as number;

  const { ageYears, chestCm, waistCm } = raw;
  if (ageYears !== undefined && ageYears !== null) {
    if (
      typeof ageYears !== "number" ||
      !Number.isFinite(ageYears) ||
      ageYears < 0 ||
      ageYears > MAX_KID_AGE_YEARS
    ) {
      return { error: "Invalid or missing measurement: ageYears" };
    }
    return { measurements: { heightCm, weightKg, shoeSizeEu, ageYears } };
  }

  if (!positive(chestCm)) return { error: "Invalid or missing measurement: chestCm" };
  if (!positive(waistCm)) return { error: "Invalid or missing measurement: waistCm" };
  return { measurements: { heightCm, weightKg, shoeSizeEu, chestCm, waistCm } };
}
