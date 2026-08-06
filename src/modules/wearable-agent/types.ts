export type OnboardingPhase = "profile" | "generating" | "avatar-selection";

export interface AvatarVariation {
  id: string;
  label: string;
  imageUrl: string;
  /** Fixed backdrop plate this variation is paired with (absent for custom uploads). */
  backdropUrl?: string;
}

export interface TryOnProfile {
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
