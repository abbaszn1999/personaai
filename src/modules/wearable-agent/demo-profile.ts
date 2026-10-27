import type { TryOnAudience, TryOnProfile } from "./types";
/**
 * A ready-made shopper for the branding page's live preview, so a merchant can open the real
 * widget and start typing or wearing items straight away instead of creating an avatar first.
 *
 * It is a normal, already-submitted profile: the avatar is one of the studio photos the widget
 * already ships, the measurements are typical for that department, and everything downstream
 * (chat, size advice, try-on renders) treats it like any shopper's profile.
 */
export interface DemoSeed {
  audience: TryOnAudience;
}

// Opaque studio photos, like a real shopper's render: the backdrop is part of the picture, so the
// try-on edits it as it is and the measurement marks find the body from its edges.
const FEMALE_AVATAR = "/avatars/demo/demo-female-1.webp";
const MALE_AVATAR = "/avatars/demo/demo-male-2.webp";

/** The department to preview, from the ones the store sells: the first one offered, or adult
 *  men's when the store hasn't restricted them. */
export function demoAudienceFor(audiences?: readonly TryOnAudience[]): TryOnAudience {
  return audiences && audiences.length > 0 ? audiences[0] : "man";
}

export function demoProfile(audience: TryOnAudience): TryOnProfile {
  const base: TryOnProfile = {
    audience,
    photoUrl: null,
    photoBase64: null,
    photoMimeType: null,
    heightCm: null,
    weightKg: null,
    shoeSizeEu: null,
    ageYears: null,
    chestCm: null,
    waistCm: null,
    hipsCm: null,
    avatarUrl: MALE_AVATAR,
    // No plate, as for a real shopper: the avatar already carries its own backdrop.
    backdropUrl: null,
  };

  if (audience === "woman") {
    return {
      ...base,
      avatarUrl: FEMALE_AVATAR,
      heightCm: 168,
      weightKg: 60,
      shoeSizeEu: 38,
      chestCm: 90,
      waistCm: 72,
      hipsCm: 98,
    };
  }

  if (audience === "kids-boy" || audience === "kids-girl" || audience === "kids-unisex") {
    return {
      ...base,
      avatarUrl: audience === "kids-girl" ? FEMALE_AVATAR : MALE_AVATAR,
      ageYears: 8,
      heightCm: 130,
      weightKg: 28,
      shoeSizeEu: 33,
    };
  }

  return {
    ...base,
    avatarUrl: audience === "unisex" ? FEMALE_AVATAR : MALE_AVATAR,
    heightCm: 178,
    weightKg: 75,
    shoeSizeEu: 43,
    chestCm: 98,
    waistCm: 82,
    hipsCm: 98,
  };
}
