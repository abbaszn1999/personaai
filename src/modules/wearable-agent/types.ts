export type BodyShape = "rectangle" | "hourglass" | "pear" | "apple" | "inverted-triangle";

export interface TryOnProfile {
  photoUrl: string | null;
  heightCm: number | null;
  weightKg: number | null;
  bodyShape: BodyShape | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
}

export interface TryOnResult {
  previewImageUrl: string;
  recommendedSize: string;
  fitConfidence: number;
  fitNotes: string;
}
