import { describe, expect, it } from "vitest";
import { parseAvatarBodyMeasurements } from "./avatar-body";

const ADULT = { heightCm: 170, weightKg: 65, chestCm: 90, waistCm: 70, shoeSizeEu: 42 };
const KID = { heightCm: 120, weightKg: 25, ageYears: 6, shoeSizeEu: 32 };

describe("parseAvatarBodyMeasurements", () => {
  it("accepts an adult with chest and waist", () => {
    expect(parseAvatarBodyMeasurements(ADULT)).toEqual({ measurements: ADULT });
  });

  it("accepts a child with age and no chest or waist", () => {
    expect(parseAvatarBodyMeasurements(KID)).toEqual({ measurements: KID });
  });

  it("treats age 0 (under one year) as valid", () => {
    expect(parseAvatarBodyMeasurements({ ...KID, ageYears: 0 })).toEqual({
      measurements: { ...KID, ageYears: 0 },
    });
  });

  it("rejects an adult request missing chest or waist", () => {
    expect(parseAvatarBodyMeasurements({ ...ADULT, chestCm: undefined })).toEqual({
      error: "Invalid or missing measurement: chestCm",
    });
    expect(parseAvatarBodyMeasurements({ ...ADULT, waistCm: 0 })).toEqual({
      error: "Invalid or missing measurement: waistCm",
    });
  });

  it("rejects out-of-range or non-numeric ages", () => {
    for (const ageYears of [18, -1, "6", Number.NaN]) {
      expect(parseAvatarBodyMeasurements({ ...KID, ageYears })).toEqual({
        error: "Invalid or missing measurement: ageYears",
      });
    }
  });

  it("always needs height, weight and shoe size", () => {
    for (const key of ["heightCm", "weightKg", "shoeSizeEu"]) {
      expect(parseAvatarBodyMeasurements({ ...KID, [key]: null })).toEqual({
        error: `Invalid or missing measurement: ${key}`,
      });
    }
  });
});
