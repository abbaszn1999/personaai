import { describe, expect, it } from "vitest";
import {
  isMeasurementsComplete,
  isProfileComplete,
  normalizePersistedState,
  resumeOnboardingPhase,
} from "./use-try-on-agent";
import type { TryOnProfile } from "@/modules/wearable-agent/types";

const BASE_PROFILE: TryOnProfile = {
  audience: null,
  photoUrl: null,
  photoBase64: null,
  photoMimeType: null,
  heightCm: null,
  weightKg: null,
  shoeSizeEu: null,
  chestCm: null,
  waistCm: null,
  hipsCm: null,
  avatarUrl: null,
  backdropUrl: null,
};

const COMPLETE_MEASUREMENTS: Partial<TryOnProfile> = {
  heightCm: 170,
  weightKg: 65,
  chestCm: 90,
  waistCm: 70,
  shoeSizeEu: 42,
};

describe("isMeasurementsComplete", () => {
  it("is false until every numeric field is a positive number", () => {
    expect(isMeasurementsComplete(BASE_PROFILE)).toBe(false);
    expect(isMeasurementsComplete({ ...BASE_PROFILE, ...COMPLETE_MEASUREMENTS, waistCm: 0 })).toBe(false);
  });

  it("is true once height/weight/chest/waist/shoe size are all set, regardless of audience or photo", () => {
    expect(isMeasurementsComplete({ ...BASE_PROFILE, ...COMPLETE_MEASUREMENTS })).toBe(true);
    expect(
      isMeasurementsComplete({ ...BASE_PROFILE, ...COMPLETE_MEASUREMENTS, audience: "kids-boy" })
    ).toBe(true);
  });
});

describe("isProfileComplete", () => {
  it("additionally requires a photo on top of complete measurements", () => {
    expect(isProfileComplete({ ...BASE_PROFILE, ...COMPLETE_MEASUREMENTS })).toBe(false);
    expect(
      isProfileComplete({ ...BASE_PROFILE, ...COMPLETE_MEASUREMENTS, photoUrl: "blob:abc" })
    ).toBe(true);
  });
});

describe("resumeOnboardingPhase", () => {
  it("starts a blank or absent profile at the welcome screen", () => {
    expect(resumeOnboardingPhase(null)).toBe("welcome");
    expect(resumeOnboardingPhase(undefined)).toBe("welcome");
    // What a freshly-added profile looks like — nothing answered yet.
    expect(resumeOnboardingPhase(BASE_PROFILE)).toBe("welcome");
  });

  it("returns to welcome when measurements exist but the audience question was never answered", () => {
    expect(resumeOnboardingPhase({ ...BASE_PROFILE, ...COMPLETE_MEASUREMENTS })).toBe("welcome");
  });

  it("resumes at the combined measurements+photo step once an audience is picked, regardless of how complete the numbers are", () => {
    expect(resumeOnboardingPhase({ ...BASE_PROFILE, audience: "woman" })).toBe("measurements");
    expect(
      resumeOnboardingPhase({ ...BASE_PROFILE, audience: "woman", ...COMPLETE_MEASUREMENTS, chestCm: null })
    ).toBe("measurements");
    expect(
      resumeOnboardingPhase({ ...BASE_PROFILE, audience: "kids-girl", ...COMPLETE_MEASUREMENTS })
    ).toBe("measurements");
  });

  it("never resumes past measurements, since the raw photo is intentionally never persisted", () => {
    // Even a profile that still carries a (dead) photoUrl stops at the combined step so the
    // shopper can re-pick a photo before an avatar can be generated.
    expect(
      resumeOnboardingPhase({
        ...BASE_PROFILE,
        audience: "man",
        ...COMPLETE_MEASUREMENTS,
        photoUrl: "blob:stale",
      })
    ).toBe("measurements");
  });
});

describe("normalizePersistedState", () => {
  it("returns null for garbage input", () => {
    expect(normalizePersistedState(null)).toBeNull();
    expect(normalizePersistedState("nope")).toBeNull();
    expect(normalizePersistedState({})).toBeNull();
  });

  it("migrates the pre-multi-profile (single `profile`) shape into one profile slot, backfilling audience", () => {
    const legacy = {
      profile: { ...BASE_PROFILE, ...COMPLETE_MEASUREMENTS },
      profileSubmitted: true,
      messages: [],
      outfitItems: [],
      cartItems: [],
      intakeAnswers: {},
      knownProducts: {},
      tryOnImages: [],
      currentImageIndex: 0,
      selectedAvatarId: "style-1",
      selectedAnchor: null,
    };
    // Simulates data written before `audience` existed on TryOnProfile.
    delete (legacy.profile as Partial<TryOnProfile>).audience;

    const result = normalizePersistedState(legacy);
    expect(result).not.toBeNull();
    expect(result!.profiles).toHaveLength(1);
    expect(result!.profiles[0].profile.audience).toBeNull();
    // A shopper who already finished onboarding must never be bounced back into it after this
    // migration — try-on-layout only re-shows the onboarding flow when profileSubmitted is false.
    expect(result!.profiles[0].profileSubmitted).toBe(true);
    expect(result!.activeProfileId).toBe(result!.profiles[0].id);
  });

  it("backfills a missing `audience` on every slot of an already-multi-profile payload", () => {
    const multiProfile = {
      profiles: [
        {
          id: "a",
          label: "Me",
          profile: { ...BASE_PROFILE, ...COMPLETE_MEASUREMENTS },
          profileSubmitted: true,
          selectedAvatarId: "style-1",
          tryOnImages: [],
          currentImageIndex: 0,
        },
        {
          id: "b",
          label: "Kid",
          profile: { ...BASE_PROFILE },
          profileSubmitted: false,
          selectedAvatarId: null,
          tryOnImages: [],
          currentImageIndex: 0,
        },
      ],
      activeProfileId: "a",
      messages: [],
      outfitItems: [],
      cartItems: [],
      intakeAnswers: {},
      knownProducts: {},
      selectedAnchor: null,
    };
    // Simulates data written before `audience` existed, for both slots.
    for (const slot of multiProfile.profiles) {
      delete (slot.profile as Partial<TryOnProfile>).audience;
    }

    const result = normalizePersistedState(multiProfile);
    expect(result).not.toBeNull();
    expect(result!.profiles).toHaveLength(2);
    expect(result!.profiles[0].profile.audience).toBeNull();
    expect(result!.profiles[1].profile.audience).toBeNull();
    expect(result!.activeProfileId).toBe("a");
  });

  it("passes an already-complete multi-profile payload through unchanged (aside from normalization)", () => {
    const payload = {
      profiles: [
        {
          id: "a",
          label: "Me",
          profile: { ...BASE_PROFILE, ...COMPLETE_MEASUREMENTS, audience: "woman" as const },
          profileSubmitted: true,
          selectedAvatarId: "style-1",
          tryOnImages: [],
          currentImageIndex: 0,
        },
      ],
      activeProfileId: "a",
      messages: [],
      outfitItems: [],
      cartItems: [],
      intakeAnswers: {},
      knownProducts: {},
      selectedAnchor: null,
    };

    const result = normalizePersistedState(payload);
    expect(result!.profiles[0].profile.audience).toBe("woman");
  });
});
