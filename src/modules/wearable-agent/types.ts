export type BodyShape = "rectangle" | "hourglass" | "pear" | "apple" | "inverted-triangle";

export type OnboardingPhase = "profile" | "generating" | "avatar-selection";

export interface AvatarVariation {
  id: string;
  label: string;
  imageUrl: string;
}

export interface TryOnProfile {
  photoUrl: string | null;
  heightCm: number | null;
  weightKg: number | null;
  bodyShape: BodyShape | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  avatarUrl: string | null;
}

export interface TryOnResult {
  previewImageUrl: string;
  recommendedSize: string;
  fitConfidence: number;
  fitNotes: string;
}
