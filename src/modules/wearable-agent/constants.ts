import type { AvatarVariation, BodyShape } from "./types";

export const BODY_SHAPE_LABELS: Record<BodyShape, string> = {
  rectangle: "Rectangle",
  hourglass: "Hourglass",
  pear: "Pear",
  apple: "Apple",
  "inverted-triangle": "Inverted Triangle",
};

export const AVATAR_GENERATION_STAGES = [
  { label: "Analyzing your face photo", progress: 18 },
  { label: "Mapping body measurements", progress: 42 },
  { label: "Building your body model", progress: 68 },
  { label: "Generating avatar variations", progress: 88 },
  { label: "Almost ready…", progress: 100 },
] as const;

/**
 * Full-body studio photographs used as standing avatars.
 * Each image is a complete studio shot (architectural backdrop + lighting +
 * model) so it can be dropped in as a single cohesive "stage" background,
 * matching a real photography-studio try-on experience.
 */
export const MOCK_AVATAR_VARIATIONS: AvatarVariation[] = [
  {
    id: "av-1",
    label: "Brown Blazer",
    imageUrl: "/avatars/avatar-studio-male-1.png",
  },
  {
    id: "av-2",
    label: "Navy Suit",
    imageUrl: "/avatars/avatar-studio-male-2.png",
  },
  {
    id: "av-3",
    label: "Beige Tailored",
    imageUrl: "/avatars/avatar-studio-female-1.png",
  },
  {
    id: "av-4",
    label: "Black Midi",
    imageUrl: "/avatars/avatar-studio-female-2.png",
  },
];

/** Default standing mannequin — full studio photo shown before onboarding completes. */
export const DEFAULT_MANNEQUIN_IMAGE = "/avatars/avatar-studio-male-1.png";

/**
 * Maps a body shape to the closest-matching studio avatar variation, used to
 * simulate "regenerating" the mannequin after the shopper edits their stats.
 */
export function pickAvatarForBodyShape(bodyShape: BodyShape | null): string {
  if (!bodyShape) return DEFAULT_MANNEQUIN_IMAGE;
  const map: Record<BodyShape, string> = {
    rectangle: MOCK_AVATAR_VARIATIONS[1].imageUrl,
    hourglass: MOCK_AVATAR_VARIATIONS[3].imageUrl,
    pear: MOCK_AVATAR_VARIATIONS[2].imageUrl,
    apple: MOCK_AVATAR_VARIATIONS[0].imageUrl,
    "inverted-triangle": MOCK_AVATAR_VARIATIONS[1].imageUrl,
  };
  return map[bodyShape];
}

/** Demo outfit swatches shown before items are added (matches the default look). */
export const MOCK_OUTFIT_SWATCHES = [
  { id: "sw-brown", label: "Brown", imageUrl: "/avatars/avatar-studio-male-1.png" },
  { id: "sw-navy", label: "Navy", imageUrl: "/avatars/avatar-studio-male-2.png" },
  { id: "sw-beige", label: "Beige", imageUrl: "/avatars/avatar-studio-female-1.png" },
] as const;

export const DEMO_SIZE_RECOMMENDATIONS = [
  { label: "Blazer", size: "M" },
  { label: "Shirt", size: "M" },
  { label: "Pant", size: "32" },
] as const;
