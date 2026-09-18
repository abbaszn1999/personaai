// "measurements" now covers both the numeric fields and the photo upload on one combined
// screen — there's no separate "photo" phase anymore (fewer taps to reach avatar generation).
export type OnboardingPhase =
  | "audience"
  | "measurements"
  | "generating"
  | "avatar-selection";

/** Who this profile is being set up for — shopper-declared, stored on the profile only.
 *  Not currently wired into search filters, sizing charts, or the persona prompt. */
export type TryOnAudience = "woman" | "man" | "unisex" | "kids-boy" | "kids-girl" | "kids-unisex";

export interface AvatarVariation {
  id: string;
  label: string;
  imageUrl: string;
  /** Fixed backdrop plate this variation is paired with (absent for custom uploads). */
  backdropUrl?: string;
}

export interface TryOnProfile {
  audience: TryOnAudience | null;
  photoUrl: string | null;
  /** Base64-encoded face photo bytes, sent to the Persona Agent (client-only, in-memory). */
  photoBase64: string | null;
  photoMimeType: string | null;
  heightCm: number | null;
  weightKg: number | null;
  shoeSizeEu: number | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  avatarUrl: string | null;
  /** Fixed backdrop plate paired with the confirmed avatar, reused for every try-on render. */
  backdropUrl: string | null;
}

export interface TryOnResult {
  previewImageUrl: string;
  recommendedSize: string;
  fitConfidence: number;
  fitNotes: string;
}
