import { describe, expect, it } from "vitest";
import { demoAudienceFor, demoProfile } from "./demo-profile";
import { DEFAULT_MANNEQUIN_IMAGE } from "./constants";
import type { TryOnAudience } from "./types";

const ALL: TryOnAudience[] = ["woman", "man", "unisex", "kids-boy", "kids-girl", "kids-unisex"];

describe("demoAudienceFor", () => {
  it("previews the first department the store sells", () => {
    expect(demoAudienceFor(["woman", "man"])).toBe("woman");
    expect(demoAudienceFor(["kids-girl"])).toBe("kids-girl");
  });

  it("falls back to men's when the store has not restricted departments", () => {
    expect(demoAudienceFor(undefined)).toBe("man");
    expect(demoAudienceFor([])).toBe("man");
  });
});

describe("demoProfile", () => {
  it("is a complete shopper for every department", () => {
    for (const audience of ALL) {
      const profile = demoProfile(audience);
      expect(profile.audience, audience).toBe(audience);
      expect(profile.avatarUrl, audience).toBeTruthy();
      expect(profile.backdropUrl, audience).toBeTruthy();
      expect(profile.heightCm, audience).toBeGreaterThan(0);
      expect(profile.weightKg, audience).toBeGreaterThan(0);
      expect(profile.shoeSizeEu, audience).toBeGreaterThan(0);
    }
  });

  it("never uses the fallback mannequin, which the avatar panel draws without a backdrop", () => {
    for (const audience of ALL) {
      expect(demoProfile(audience).avatarUrl, audience).not.toBe(DEFAULT_MANNEQUIN_IMAGE);
    }
  });

  it("asks kids for an age instead of chest and waist, and adults the reverse", () => {
    const child = demoProfile("kids-boy");
    expect(child.ageYears).toBeGreaterThan(0);
    expect(child.chestCm).toBeNull();
    expect(child.waistCm).toBeNull();

    for (const audience of ["woman", "man", "unisex"] as const) {
      const adult = demoProfile(audience);
      expect(adult.ageYears, audience).toBeNull();
      expect(adult.chestCm, audience).toBeGreaterThan(0);
      expect(adult.waistCm, audience).toBeGreaterThan(0);
    }
  });
});
